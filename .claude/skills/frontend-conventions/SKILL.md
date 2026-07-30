---
name: frontend-conventions
description: Convenciones de UI y reglas de acceso a datos para toda pantalla de feature en apps/web (dashboard, rewards, customers, etc.). Úsala SIEMPRE antes de escribir o modificar páginas, componentes o server actions de features — define los patrones de Next.js App Router/shadcn/Tailwind y las reglas NO negociables de datos tenant-scoped.
---

# Convenciones de frontend — apps/web

## Stack y estructura

- **Next.js App Router** (ya decidido, no re-litigar). Server Components por
  defecto; `"use client"` solo donde hay interactividad real (formularios,
  estado local). Server Actions (`"use server"`) para mutaciones.
- **shadcn/ui + Tailwind** para UI. Componentes de shadcn se copian a
  `apps/web/components/ui/` (así funciona shadcn: código propio, no
  dependencia de runtime). No inventes variantes visuales nuevas si un
  componente de shadcn ya lo resuelve.
- Estructura por feature: `apps/web/app/<feature>/page.tsx` (Server
  Component, hace el fetch), `actions.ts` (mutaciones), componentes cliente
  colocados junto a la página que los usa (`<Feature>Form.tsx`). Componentes
  compartidos entre features van en `apps/web/components/`.
- TypeScript estricto; los tipos de fila salen de Drizzle
  (`typeof tabla.$inferSelect`), no se duplican a mano.

## Estados obligatorios en toda pantalla de datos

Toda pantalla que muestre datos de tenant define SIEMPRE sus tres estados:

- **Vacío**: mensaje claro + acción siguiente (p.ej. "Todavía no hay
  clientes. Da de alta el primero."). Nunca una tabla vacía sin explicación.
- **Carga**: `loading.tsx` por ruta (App Router lo usa automáticamente) o
  `<Suspense>` con skeletons de shadcn.
- **Error**: `error.tsx` por ruta con mensaje genérico y opción de
  reintentar. NUNCA mostrar mensajes internos (SQL, stack traces, nombres de
  tabla) al usuario. Un recurso inexistente usa `notFound()` de
  `next/navigation`, no un error 500.

## Reglas NO negociables de acceso a datos

Estas reglas son de seguridad multi-tenant. Violarlas = el peor bug posible
del proyecto (negocio A ve datos del negocio B). CLAUDE.md manda; esto las
aterriza para las rutas de feature:

1. **Todo acceso a datos de tenant pasa por `withTenantContext()`**
   (`@loyalty/db`), que abre transacción con `app_user` (sin BYPASSRLS) y
   fija `app.current_business_id` vía `SET LOCAL` parametrizado. No hay otra
   vía sancionada.

2. **NUNCA `adminDb` / `@loyalty/db/admin` en rutas de feature.** El rol de
   servicio queda confinado a migraciones, seed, setup de tests y el camino
   de alta de negocios en `/admin`. Si una feature "necesita" adminDb, el
   diseño está mal — detente y pregunta. `grep "@loyalty/db/admin"
   apps/web/app` debe devolver SOLO `/admin`.

3. **`business_id` sale EXCLUSIVAMENTE de la sesión verificada**:
   `getVerifiedSession()` / `requireTenantSession()`
   (`apps/web/lib/supabase/session.ts`). Jamás de un query param, route
   param, body, header ni cookie leída a mano. El tipo `VerifiedBusinessId`
   existe para que el compilador lo recuerde: el único `as
   VerifiedBusinessId` permitido en producción está en `session.ts`.

4. **Cinturón y tirantes**: además de RLS, TODA query de feature filtra
   explícitamente por `business_id` a nivel de aplicación
   (`where(eq(tabla.businessId, session.businessId))`). RLS es la red de
   seguridad, no la primera línea. Una query sin el filtro explícito es un
   hallazgo de revisión aunque RLS la cubra.

5. **Toda lectura por id es tenant-scoped — sin IDOR.** Buscar un recurso
   por id SIEMPRE combina el id con el `business_id` de la sesión:
   `where(and(eq(t.id, id), eq(t.businessId, session.businessId)))`. Un id
   que pertenece a otro negocio devuelve el MISMO resultado que un id
   inexistente: `notFound()`. Nunca un error distinto que confirme que el
   recurso existe en otro tenant.

6. **Autorización por rol dentro del tenant**: `session.role`
   (`owner`/`admin`/`staff`) decide qué mutaciones se permiten. El chequeo
   vive en la Server Action (invocable directamente como endpoint — el gate
   en la página que renderiza el form NO basta), antes de tocar datos.
   Ejemplo: config del programa de sellos la edita solo `owner`; `staff` la
   ve pero el action rechaza su escritura.

7. **Mutaciones sensibles → `audit_logs`** dentro de la MISMA transacción
   `withTenantContext` que hace el cambio (quién: `session.authUserId`;
   qué: action + entity; dónde: business_id/location).

8. **Validar input del cliente en el servidor** (la Server Action), nunca
   confiar en la validación del navegador. Ids se validan como UUID antes de
   tocar la DB; strings se recortan y acotan.

## Patrón de página de feature (referencia)

```tsx
// app/<feature>/page.tsx — Server Component
export default async function FeaturePage() {
  const session = await requireTenantSession();
  if (!session) redirect("/login");

  const rows = await withTenantContext(session.businessId, (tx) =>
    tx.select().from(tabla).where(eq(tabla.businessId, session.businessId)),
  );

  if (rows.length === 0) return <EstadoVacio />;
  return <Listado rows={rows} />;
}
```

```ts
// app/<feature>/actions.ts — mutación
"use server";
export async function mutarAlgo(_prev: State, formData: FormData): Promise<State> {
  const session = await requireTenantSession();
  if (!session) return { error: "No autorizado." };
  if (session.role !== "owner") return { error: "Solo el dueño puede hacer esto." };

  // validar input → withTenantContext(session.businessId, tx => { cambio + audit_log })
  // revalidatePath("/<feature>") al final si cambió lo que la página muestra
}
```

## Qué NO hacer (errores ya cometidos o casi)

- `process.env[nombre]` dinámico en código de navegador: Next.js solo
  reemplaza acceso estático (`process.env.NEXT_PUBLIC_X`) en el bundle.
- Confiar en `detectSessionInUrl` de `@supabase/ssr` para flujos con
  fragmento `#access_token` — el cliente fija PKCE y los rechaza en
  silencio (ver `set-password/page.tsx`).
- `event.target.value` en handlers tipados: usar `event.currentTarget.value`.
- Gatear una Server Action solo desde la página que la renderiza.
- Devolver 403/mensaje distinto para recursos de otro tenant (eso es un
  oráculo de existencia — usar `notFound()`).
