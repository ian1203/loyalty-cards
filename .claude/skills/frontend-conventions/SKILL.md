---
name: frontend-conventions
description: Convenciones de UI y reglas de acceso a datos para toda pantalla de feature en apps/web (dashboard, rewards, customers, scanner, etc.). Úsala SIEMPRE antes de escribir o modificar páginas, componentes o server actions de features — define los patrones de Next.js App Router/shadcn/Tailwind, las reglas NO negociables de datos tenant-scoped, y las convenciones de PWA/scanner (cámara, lector USB, instalabilidad).
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

## PWA / scanner (Fase 3+)

### Instalabilidad y service worker
- **Manifest** (`app/manifest.ts` de App Router): `name`/`short_name`,
  `start_url` apuntando a la ruta del scanner, `display: "standalone"`,
  `theme_color`/`background_color` coherentes con el tema, íconos 192 y 512
  (maskable). Sin manifest válido no hay prompt de instalación.
- **Service worker MÍNIMO**: solo lo necesario para que la app sea
  instalable y cargue su shell. **SIN cola offline** — el MVP exige conexión
  al registrar sellos/canjes: un movimiento de sello que "se guarda para
  después" rompe la idempotencia y el cooldown server-side. Si no hay red,
  la UI lo dice claro y no permite operar; NUNCA aceptar la operación en
  local para "sincronizar luego".
- No usar librerías de PWA (next-pwa, workbox) sin preguntar — regla de
  dependencias. Un SW de ~20 líneas escrito a mano basta para el MVP.

### Cámara
- **Solo en contexto seguro**: `getUserMedia` exige HTTPS; `localhost`
  cuenta como seguro en dev, pero un teléfono apuntando a la IP de la
  laptop NO — para probar en móvil real hace falta túnel HTTPS o el flag
  de "insecure origins" del navegador de prueba (documentar cuál se usó).
  La UI debe detectar contexto no-seguro y explicar, no fallar en silencio.
- **Permiso con gesto del usuario**: la cámara se pide al tocar "Escanear",
  nunca al montar la página (los navegadores lo penalizan y el usuario no
  tiene contexto). Denegado → mensaje claro + fallback (input USB/búsqueda
  manual), no un reintento en loop.
- **`facingMode: "environment"`** (cámara trasera) — es la que apunta al QR
  del cliente. Detener el stream (`track.stop()`) al desmontar o al navegar:
  cámara encendida sin usarse = batería y desconfianza.

### Doble entrada: cámara y lector USB → UN solo manejador
- Los lectores USB/bluetooth de QR son "keyboard wedge": tipean el
  contenido del código como texto veloz + Enter en el elemento enfocado.
- Patrón obligatorio: **un único manejador `onToken(token: string)`** que
  reciba el token venga de donde venga. La cámara lo llama con el texto
  decodificado del QR; un `<input>` siempre enfocado (autofocus + re-focus
  al blur, invisible o discreto) lo llama en el Enter del lector. Cero
  lógica duplicada entre las dos vías: mismo trim, misma validación de
  forma, mismo POST.
- El token es OPACO: el cliente/scanner NUNCA lo interpreta ni deriva nada
  de él — se manda tal cual al server, que resuelve DENTRO del tenant de la
  sesión (mismo patrón anti-IDOR de siempre: token de otro negocio =
  not found idéntico a inexistente).
- Tras cada lectura (éxito o error): limpiar el input y re-enfocarlo — el
  mostrador encadena escaneos sin tocar la pantalla.

### Reglas de negocio en el server, SIEMPRE
- La UI del scanner solo REFLEJA lo que el server decidió: cooldown,
  idempotencia, sellos suficientes, negocio/empleado activos y sucursal
  válida se evalúan server-side en cada operación. Deshabilitar un botón en
  la UI es cortesía, no seguridad.
- Toda operación de sello/canje manda su `idempotency_key` generada en el
  cliente POR ACCIÓN (no por sesión); un replay devuelve el resultado
  original, jamás un segundo movimiento.

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
