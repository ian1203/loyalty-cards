---
name: tenant-onboarding
description: Procedimiento para dar de alta un negocio (tenant) real nuevo en producción — negocio, dueño, sucursal(es), branding de Wallet, programa de sellos placeholder, y staff inicial. Úsala siempre que se incorpore un cliente real nuevo a la plataforma; ya se siguió dos veces (Chilaquikes, Iriz Style), no la reinventes.
---

# Onboarding de negocio nuevo en producción

`/admin` (ver `claude.md`, "Panel de administración de plataforma") solo
tiene UI para crear `businessName`+`ownerEmail`. Todo lo demás que un
negocio real necesita el día 1 — sucursal, branding de Wallet, programa de
sellos, staff — se resuelve a mano contra producción con este
procedimiento. Por qué no está todo en `/admin` todavía: cada pieza
(branding con validador de contraste, programa placeholder, staff) se
necesitó una sola vez por negocio hasta ahora — dos negocios no justifican
la inversión de construir UI para todo; si un tercer negocio confirma el
patrón, considera proponer subir alguna pieza a `/admin`.

No hay `DATABASE_URL` de producción legible localmente (Vercel la marca
Sensitive/write-only) — el patrón de todos los scripts de esta skill es
usar `@supabase/supabase-js` con el `service_role` real SOLO para lo que
requiere la Auth Admin API (invitar usuarios, crear credenciales), e
**imprimir** el SQL idempotente (con `ON CONFLICT`/`NOT EXISTS`, seguro de
correr dos veces) para que tú lo corras vía `supabase db query --linked`.
Nunca insertes filas de negocio directo desde el script.

## Checklist, en orden

1. **Negocio + dueño + sucursal** — replica `createBusinessWithOwner`
   (`packages/db/src/admin.ts`) + el paso de invite de
   `apps/web/app/admin/actions.ts`: invita al dueño por email
   (`inviteUserByEmail`, `redirectTo: {SITE_URL}/set-password` —
   idempotente: si el email ya existe en `auth.users`, reusa su id, NUNCA
   reinvites), imprime el SQL que inserta `businesses` (con `slug` vía el
   mismo algoritmo que `apps/web/lib/slugify.ts`) + `users` (rol owner) +
   `audit_logs` (`business.created`, actor = el platform admin que corre
   el script, debe existir YA en `platform_admins` o la FK falla) +
   `locations` (al menos una sucursal real). Ver
   `apps/web/scripts/create-iriz-style-business.ts` como plantilla
   completa. El script debe imprimir el `business_id` resultante al final
   — los pasos siguientes lo necesitan.
2. **`brand_color_hex`** — si la paleta real del cliente es toda clara/
   pastel, NO la uses tal cual: `passGeneration.ts` fija un
   `foreground`/`label` CLARO pensado para fondo oscuro (ver skill
   `wallet-integration`), así que un fondo pastel deja el texto del pase
   ilegible. Si la paleta enviada no tiene ningún tono oscuro/saturado con
   contraste garantizado, usa negro (`#000000`) — los pasteles quedan
   disponibles como acento decorativo en logo/strip (imagen, no texto)
   más adelante.
3. **Logo circular de `/enroll`** — si el logo real del cliente es un
   wordmark claro sobre transparencia, NO lo uses directo en el avatar
   circular (fondo claro de `/enroll`, `object-cover` lo deja invisible o
   recortado): compón un círculo de fondo sólido (mismo tono que el resto
   del branding) con el wordmark completo contenido sin recorte, y usa
   ESE archivo compuesto tanto para `/enroll` como para `programLogo` de
   Google Wallet (evita el bug ya encontrado de un logo que funciona en
   Apple pero se ve invisible en la lista de "Pases" de Google — ver
   `docs/HISTORY.md`, "Google Wallet — logo de Iriz invisible").
4. **Programa de sellos placeholder** — sin programa, `/enroll/<slug>` no
   puede entregar ningún pase real (`loadCustomerLoyaltySnapshot` devuelve
   `null`). Créalo con los mismos defaults que ofrece el propio formulario
   de `/rewards` (nombre genérico tipo "Tarjeta de sellos", ~10 sellos,
   recompensa "Recompensa por definir") — es un placeholder real en la
   tabla, no un mock; el dueño lo edita después desde `/rewards`.
5. **Assets de Wallet** (strip de Apple, Loyalty Class de Google) — una
   vez que el programa tiene `stampsRequired` real, sigue la skill
   `wallet-integration` (sección "Generación de assets del pase") para
   generarlos y verificarlos con un `.pkpass` real antes de dar por hecho
   que quedaron bien.
6. **Staff inicial** (si aplica): dos casos distintos, no los confundas.
   - **Staff real del negocio** (empleados que van a sellar/canjear día a
     día): si el dueño ya tiene acceso, mejor que los dé de alta él mismo
     desde `/team` (alta real de staff, ver `claude.md`) — no necesitas
     script. Si hace falta poblarlos antes de que el dueño tenga acceso
     (p.ej. arranque coordinado con el cliente), replica el patrón de
     `apps/web/scripts/create-chilaquikes-employees.ts`: contraseña
     generada localmente (nunca en texto plano en un log persistente),
     idempotente (email que ya existe no se toca), `employees.primary_location_id`
     fijo a la sucursal real de cada quien.
   - **Credencial temporal de QA/soporte** (acceso de plataforma para
     validar algo puntual, no un empleado real): replica
     `apps/web/scripts/create-iriz-style-staff.ts` — documenta
     explícitamente en el propio script que es temporal, y revócala
     (desactivar vía `/team`) o rota la contraseña en cuanto termine la
     validación. No es staff real, no lo dejes viviendo indefinidamente.
7. **Aislamiento RLS** — no hace falta reverificar nada: la política
   `tenant_isolation` (RLS `ENABLED`+`FORCED`) es genérica y cubre
   cualquier `business_id` nuevo automáticamente. Si quieres confirmarlo
   en vivo (no solo estructuralmente), necesitas una sesión real de
   tenant del negocio nuevo — el rol `postgres` gestionado de Supabase no
   tiene permiso para `SET ROLE app_user` vía `supabase db query --linked`.

## Qué NO hacer

- No insertes filas de negocio (`businesses`/`users`/`locations`/etc.)
  directo desde un script con `service_role` contra Postgres — imprime el
  SQL y córrelo tú vía `supabase db query --linked`, mismo patrón que
  todos los scripts existentes.
- No reinvites a un email que ya existe en `auth.users` — rompe el link
  de invitación si el dueño ya tiene uno pendiente o ya inició sesión.
- No dejes una credencial de QA/soporte temporal sin revocar una vez
  terminada la validación.
- No confundas "staff real del negocio" con "credencial de plataforma
  para QA" — tienen ciclos de vida y de confianza distintos (ver punto 6).
