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

**FASE 2 — Programa de sellos + directorio de clientes**: `/rewards`
(config del programa: stamps_required, cooldown, activo; reglas de
recompensa — solo dueño edita, staff ve read-only, todo auditado) y
`/customers` (alta manual dueño/staff con balance inicial 0 y wallet_token
opaco; directorio con búsqueda tenant-scoped; detalle anti-IDOR). UI:
Tailwind v4 + shadcn/ui (ver skill `frontend-conventions` — rige toda
pantalla de feature). Patrón de seguridad clave: la lógica de cada action
vive en `logic.ts` (SIN `"use server"`, recibe la sesión como parámetro —
en un archivo `"use server"` quedaría expuesta como endpoint invocable con
sesión forjada) y `actions.ts` es un shim que resuelve la sesión desde
cookies verificadas. Primitivos compartidos en `apps/web/lib/tenant.ts`:
`findInTenant` (lectura por id anti-IDOR), `resolveActor` + `writeAuditLog`
(audit con `actor_user_id` — NUNCA `actor_auth_user_id`, cuya FK apunta a
`platform_admins` y rechaza actores de tenant). Definición de "listo"
cumplida: `apps/web/tests/fase2-features.test.ts` prueba con sesiones
reales IDOR (cliente de B desde A → null idéntico a inexistente), listado
sin fuga cross-tenant, staff no edita el programa, alta+dedupe por tenant,
y cero `@loyalty/db/admin` en rutas de feature (test permanente).
Revisión `tenant-security-reviewer`: sin hallazgos críticos/altos.

**FASE 3 — Scanner PWA + sellado + canje**: motor de lealtad puro en
`packages/core/src/loyalty.ts` (evaluateStamp con cooldown de límite
inclusivo, applyStamp sin tope, evaluateRedemption/applyRedemption —
**el canje ARRASTRA el sobrante**, no resetea a 0: el balance puede superar
`stamps_required` legítimamente y resetear descartaría visitas reales ya
en el ledger de `transactions`). `apps/web/app/scanner/logic.ts` es el
camino de escritura más sensible: `lookupCustomerByTokenForSession`
resuelve el token del QR DENTRO del tenant (anti-IDOR + rate limiter en
memoria anti-enumeración) y `registerStampForSession`/
`redeemRewardForSession` usan `SELECT ... FOR UPDATE` sobre
`customer_balances` (serializa por cliente+programa) + replay-check por
`idempotency_key` bajo el lock + `UNIQUE(business_id, idempotency_key)`
como backstop — probado con `Promise.all` real contra Postgres, no
simulado. **Revocación en vivo implementada** (ver Arquitectura): sellar y
canjear verifican `businesses.status`/`users.is_active`/`employees.is_active`
frescos contra la DB en cada operación, y la sucursal la selecciona el
empleado pero el server la valida contra `employees.primary_location_id`
— el `location_id` del JWT nunca se usa. Alcance de esa revocación:
deliberadamente solo sellar/canjear (las "operaciones sensibles" de la
decisión original) — `/rewards` y el alta de cliente no la necesitan.
PWA: manifest + service worker mínimo, sin cola offline (`ScannerClient`
bloquea toda operación si `navigator.onLine` es false). Definición de
"listo" cumplida: `apps/web/tests/fase3-scanner.test.ts` (18 tests, sesión
real) prueba replay, concurrencia real (misma key y keys distintas),
cooldown, canje insuficiente, canje concurrente, token cross-tenant,
negocio suspendido, empleado inactivo, sucursal ajena/no-asignada, y
auditoría con empleado+sucursal. Revisión `tenant-security-reviewer`
(dos pasadas): la primera sobre los endpoints, sin hallazgos altos; la
segunda encontró y se corrigió un **CRÍTICO** — el service worker
cacheaba `/scanner` (HTML con datos del tenant: sucursales, programa) con
estrategia cache-first sin invalidar por sesión, filtrando datos de un
negocio a otro si el mismo dispositivo se reutilizaba. Regla permanente
resultante: **un service worker de esta app nunca cachea HTML ni ninguna
respuesta que dependa de sesión — solo assets verdaderamente estáticos y
globales** (hoy: dos íconos).

## Fase actual: sin definir todavía
FASE 2b (candidato principal: `/enroll` público para que el cliente final
se dé de alta solo, con su propio QR) no está acotada — sería el paso
lógico antes de Fase 4 (Wallet, que necesita ese QR ya emitido). No las
empieces sin pedir el alcance primero — misma regla que rigió Fase 0 → 1 →
2 → 3.

## Arquitectura (decidida, no re-litigar)
- Monorepo, TypeScript-first. Frontend: Next.js. DB: PostgreSQL (Supabase/Neon).
- Auth: Supabase Auth. Claims de tenant (`business_id`/`tenant_role`/
  `location_id`/`is_platform_admin`) inyectados vía custom access token hook
  (función Postgres), nunca calculados en la app a partir de datos sin
  verificar. Firma asimétrica (ES256, JWKS por proyecto); TTL del access
  token: 3600 s (`jwt_expiry` en supabase/config.toml).
- Revocación: la verificación local del JWT NO revoca al instante — un
  usuario desactivado o un negocio suspendido conserva su token hasta que
  expira (≤1 h) o se refresca. Para el dashboard/config de solo-lectura o
  edición no sensible (`/dashboard`, `/rewards`, alta de cliente) eso es
  aceptable y nos apoyamos en el TTL corto. Para las operaciones sensibles
  —sellar y canjear, `apps/web/app/scanner/logic.ts`— **implementado desde
  Fase 3**: check en vivo de `businesses.status`/`users.is_active`/
  `employees.is_active` contra la DB en el momento de cada operación,
  dentro de la misma transacción. Al extender esta lista de operaciones
  sensibles en fases futuras, replicar ese patrón (`requireOperationContext`
  en `scanner/logic.ts` es la referencia), no inventar uno nuevo.
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
- Ningún service worker de esta app cachea HTML ni ninguna respuesta que
  dependa de sesión/tenant — solo assets estáticos y globales (ver el
  hallazgo crítico corregido en Fase 3: cachear una página con datos de
  negocio filtra ese negocio a quien reutilice el dispositivo después).

## Convenciones
- Pregunta antes de instalar dependencias nuevas.
- No toques secretos ni los subas al repo; usa variables de entorno.