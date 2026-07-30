# Plataforma de fidelización — Tarjetas digitales en Wallet

## Misión
Plataforma multi-tenant de fidelización y recompra para negocios locales,
mediante tarjetas digitales en Apple Wallet y Google Wallet. NO es solo un
generador de tarjetas: el núcleo es el motor de lealtad y la separación de datos.

## Fases completadas

**FASE 0 — Cimientos**: esquema + migraciones de las tablas core (todas con
business_id), políticas RLS por business_id en toda tabla tenant, rol
`app_user` sin BYPASSRLS. Definición de "listo" cumplida:
`packages/db/tests/isolation.test.ts` prueba que un negocio no puede leer ni
escribir datos de otro.

**FASE 1 — Auth real, tenencia real, alta de admin, shell del dueño**:
Supabase Auth (ver Arquitectura) con un custom access token hook
(`packages/db/migrations/0010_supabase_auth_bridge.sql`) que inyecta
`business_id`/`tenant_role`/`location_id`/`is_platform_admin` verificados en
cada JWT. `getVerifiedSession()` (`apps/web/lib/supabase/session.ts`) es el
único punto sancionado para leer identidad — `business_id` nunca sale de
input de cliente (query/body/params), solo de ahí. Alta de negocio + dueño
confinada a `/admin` (`requirePlatformAdmin()`, usa `adminDb` —
`@loyalty/db/admin`, nunca `app_user` — porque al crear un negocio no existe
todavía ningún tenant al que fijar contexto). Shell de `/dashboard`:
autenticado, tenant-scoped, vacío. Definición de "listo" cumplida:
`apps/web/tests/e2e-isolation.test.ts` prueba, con sesiones reales
(login real, JWT real), que un negocio no puede leer ni escribir datos de
otro; más `apps/web/tests/fail-closed.test.ts` (sin sesión/sesión inválida
→ fail closed) y `apps/web/tests/admin-access.test.ts` (rol dueño no llega
a `/admin`).

## Fase actual: sin definir todavía
FASE 2 (candidatos: pantallas con datos reales, `/customers`, `/enroll`,
scanner) no está acotada. No la empieces sin pedir el alcance primero —
misma regla que ya regía para Fase 0 → Fase 1.

## Arquitectura (decidida, no re-litigar)
- Monorepo, TypeScript-first. Frontend: Next.js. DB: PostgreSQL (Supabase/Neon).
- Auth: Supabase Auth. Claims de tenant (`business_id`/`tenant_role`/
  `location_id`/`is_platform_admin`) inyectados vía custom access token hook
  (función Postgres), nunca calculados en la app a partir de datos sin
  verificar.
- Motor de lealtad como paquete aislado y testeable (packages/core).
- Modelo de lealtad: SELLOS por visita (no puntos ni saldo monetario).
  Programa define stamps_required; cada visita = +1 sello; al llegar al total
  se habilita la recompensa y el ciclo se reinicia.

## Reglas NO negociables
- Toda tabla de negocio lleva business_id + created_at/updated_at.
- RLS activo en toda tabla tenant; la app SIEMPRE filtra por tenant además.
- El business_id de cada request sale de una sesión verificada (JWT firmado
  por Supabase Auth, verificado con getClaims()), nunca de un input del
  cliente.
- El rol de servicio (`adminDb`/service role) nunca sirve una request
  normal — solo migraciones, seed, tests, y el camino confinado de alta de
  negocios en `/admin`.
- El QR del cliente lleva solo un token opaco/firmado, nunca datos ni saldos.
- Cada movimiento de sello: idempotency_key + cooldown configurable por programa
  (evita doble escaneo y sellos repetidos al mismo cliente).
- Todo cambio sensible se registra en audit_logs (quién, cuándo, sucursal).
- Las migraciones son la fuente de verdad del esquema.

## Convenciones
- Pregunta antes de instalar dependencias nuevas.
- No toques secretos ni los subas al repo; usa variables de entorno.