# Plataforma de fidelización — Tarjetas digitales en Wallet

## Misión
Plataforma multi-tenant de fidelización y recompra para negocios locales,
mediante tarjetas digitales en Apple Wallet y Google Wallet. NO es solo un
generador de tarjetas: el núcleo es el motor de lealtad y la separación de
datos.

Vendida al público como **Pragmia** (`apps/web/lib/marketing/content.ts`).

## Historial

`docs/HISTORY.md` tiene la narrativa completa de cada fase y ronda de
trabajo: qué se decidió, qué bugs se encontraron y cómo, iteración por
iteración. Este archivo (`claude.md`) tiene solo lo esencial y vigente —
misión, arquitectura, reglas no negociables, convenciones — para no gastar
presupuesto de contexto en historia en cada turno. Consúltalo cuando
necesites el "por qué" detrás de una decisión o el detalle de un bug ya
resuelto; no lo cargues por defecto.

## Fase actual
Sin definir todavía. Reportes/analítica es el único candidato sin empezar
y sin acotar — no lo empieces sin pedir el alcance primero (misma regla
que rigió cada fase anterior, ver `docs/HISTORY.md`).

## Arquitectura (decidida, no re-litigar)

- Monorepo, TypeScript-first. Frontend: Next.js App Router. DB: PostgreSQL
  (Supabase/Neon).
- **Auth**: Supabase Auth. Claims de tenant (`business_id`/`tenant_role`/
  `location_id`/`is_platform_admin`, más `platform_role`/
  `impersonating_business_id`/`impersonating_platform_role` para
  plataforma — ver "Panel de administración de plataforma" abajo)
  inyectados vía custom access token hook (función Postgres), nunca
  calculados en la app a partir de datos sin verificar. Firma asimétrica
  (ES256, JWKS por proyecto); TTL del access token: 3600 s (`jwt_expiry`
  en supabase/config.toml). `getVerifiedSession()`
  (`apps/web/lib/supabase/session.ts`) es el único punto sancionado para
  leer identidad de tenant — `business_id` nunca sale de input de cliente
  (query/body/params/header/cookie leída a mano), solo de ahí. El SEGUNDO
  y único otro punto sancionado es `lib/wallet/passAuth.ts`, para el web
  service público de Apple PassKit (identidad = `authenticationToken` del
  pase, no hay sesión de Supabase ahí — ver skill `wallet-integration`).
- **Revocación**: la verificación local del JWT NO revoca al instante — un
  usuario desactivado o un negocio suspendido conserva su token hasta que
  expira (≤1 h) o se refresca. Para el dashboard/config de solo-lectura o
  edición no sensible eso es aceptable, apoyado en el TTL corto. Para
  operaciones sensibles —sellar y canjear, `apps/web/app/scanner/logic.ts`—
  check en vivo de `businesses.status`/`users.is_active`/
  `employees.is_active` contra la DB en el momento de cada operación,
  dentro de la misma transacción (`requireOperationContext` en
  `scanner/logic.ts` es la referencia). Al extender esta lista de
  operaciones sensibles, replicar ese patrón, no inventar uno nuevo.
- **Motor de lealtad**: paquete aislado y testeable (`packages/core`).
  SELLOS por visita (no puntos ni saldo monetario). Programa define
  `stamps_required`; cada visita = +1 sello. Al canjear, el balance
  **ARRASTRA el sobrante — nunca resetea a 0**: puede legítimamente
  superar `stamps_required` (resetear descartaría visitas reales ya en el
  ledger de `transactions`). El `stampsRequired` de cada recompensa nunca
  puede superar el `stampsRequired` del programa (validado en
  `saveRewardRuleForSession`) — el ciclo del programa manda.
- **Wallet (Apple + Google)**: paquete aislado `packages/wallet` (sin
  Next.js/DB). Toda dependencia de proveedor vive detrás de una interfaz
  con dos impls, REAL y FAKE, resueltas por un guard todo-o-nada por
  proveedor (`resolveWalletConfig()`) — meter credenciales reales después
  no cambia ninguna línea de lógica. Credenciales reales de Apple y Google
  ya activas en producción (ver `docs/WALLET-SETUP.md`). Modelo de datos,
  patrón de adaptadores, y todo el detalle del web service/notificaciones:
  skill `wallet-integration`, léela siempre antes de tocar este código.
- **Panel de administración de plataforma / impersonación**: `/admin` es
  la UI del dueño de la PLATAFORMA (no de un negocio-tenant). Roles
  `platform_admins.platform_role` (`owner`/`viewer`, ver migración
  `0028`). Un admin puede impersonar un negocio: obtiene acceso de
  escritura completo vía una fila de `users` provisionada/reactivada
  (email sintético `platform-admin+{id}@pragmia-internal.invalid`, mismo
  actor real para `resolveActor`/`writeAuditLog`) — nunca más de un grant
  activo por admin (índice único parcial en
  `platform_impersonation_grants`), con un TTL de seguridad de 24h como
  dead man's switch (no el mecanismo real de terminación, que es
  `endImpersonation()` explícito). Desactivar un admin termina su
  impersonación activa en la misma transacción. Toda acción de `/admin`
  tiene rate limit por admin. Detalle completo, PR por PR, en
  `docs/HISTORY.md` ("Panel de administración de plataforma").
- **Observabilidad (Sentry, server-only)**: `apps/web/instrumentation.ts` +
  `sentry.server.config.ts` — sin SDK de cliente todavía (deliberado, ver
  `docs/HISTORY.md`). Único punto sancionado para reportar una excepción:
  `captureServerError()` (`apps/web/lib/observability/captureServerError.ts`)
  — su `extra` solo acepta primitivos, nunca un objeto, para que sea
  imposible pasar por error un customer/formData completo. Instrumentado
  HOY solo en los 4 catches genéricos (nunca en un error de negocio
  esperado tipo `OperationRejectedError`) de `lib/wallet/notify.ts`,
  `scanner/logic.ts` y `enroll/[slug]/logic.ts`. Tag `severity`:
  `"critical"` (scanner sellar/canjear, alta pública de `/enroll`) dispara
  alerta inmediata; `"warning"` (push/PATCH de Wallet individual, lookup
  del scanner, generación de pase post-alta) queda para revisión periódica
  salvo que la regla de alerta por volumen en Sentry detecte un patrón. No
  hay `onRequestError` global a propósito — capturar automático de
  cualquier ruta expondría PII de rutas nunca auditadas para este filtro.
- **PII/secretos hacia Sentry**: `beforeSend`/`beforeBreadcrumb`
  (`lib/observability/scrub.ts`) son la segunda línea — redactan por key
  sensible Y por patrón de texto libre (email/dígitos largos, para el caso
  real de un `detail` de Postgres embebiendo un valor de columna en un
  mensaje de error). Nunca la única línea: la primera es la disciplina de
  tipos de `captureServerError()` arriba. Verificado con datos reales de
  extremo a extremo en `apps/web/tests/observability-verification.test.ts`
  (siembra un cliente con PII reconocible, provoca el error real a través
  del código de producción, confirma que esa PII nunca aparece en la
  llamada capturada) — no basta con la prueba unitaria aislada del filtro.

## Reglas NO negociables

- Toda tabla de negocio lleva `business_id` + `created_at`/`updated_at`.
- RLS activo en toda tabla tenant; la app SIEMPRE filtra por tenant además.
- El `business_id` de cada request sale de una sesión verificada (JWT
  firmado por Supabase Auth, verificado con `getClaims()`), nunca de un
  input del cliente.
- El rol de servicio (`adminDb`/service role, y `createAdminClient()` de
  Supabase Auth Admin API — mismo espíritu) nunca sirve una request
  normal — solo migraciones, seed, tests, y los caminos confinados de
  `/admin`, `lib/employeeOffboarding.ts` y `app/(product)/team/logic.ts`.
  La lista completa y su enforcement viven en
  `apps/web/tests/prod-readiness.test.ts`
  (`ALLOWED_CREATE_ADMIN_CLIENT_IMPORTERS`) — un uso nuevo fuera de esa
  lista falla el test, no queda en un comentario. Cualquier archivo nuevo
  que genuinamente lo necesite se agrega ahí explícitamente.
- El QR del cliente lleva solo un token opaco/firmado, nunca datos ni
  saldos — el mismo `wallet_token` resuelve scanner y Wallet, nunca un
  token nuevo por superficie.
- Cada movimiento de sello: `idempotency_key` (`UNIQUE(business_id,
  idempotency_key)`, nunca único global) + cooldown configurable por
  programa. Escrituras concurrentes sobre el mismo balance se serializan
  con `SELECT ... FOR UPDATE` (ver `scanner/logic.ts`).
- Todo cambio sensible se registra en `audit_logs` (quién, cuándo,
  sucursal) dentro de la MISMA transacción que hace el cambio.
- Las migraciones son la fuente de verdad del esquema.
- Ningún service worker de esta app cachea HTML ni ninguna respuesta que
  dependa de sesión/tenant — solo assets estáticos y globales (cachear una
  página con datos de negocio filtra ese negocio a quien reutilice el
  dispositivo después). Excepción, no contradicción: las páginas públicas
  de marketing (`apps/web/app/(marketing)/`) no tienen datos de tenant, así
  que para ellas la regla es la opuesta a propósito — deben ser estáticas
  y cacheables, nunca llaman `cookies()`/`headers()`/`getVerifiedSession()`.
- Rate limiting (`apps/web/lib/rateLimit.ts`, Upstash Redis): fail-open
  uniforme (permite + advertencia logueada) si Upstash falla o no está
  configurado — nunca fail-closed. Un proveedor de rate limiting caído no
  debe tumbar una superficie real (scanner, enroll, admin).
- Ningún dato de PII de cliente (nombre, teléfono, email, cumpleaños,
  ocupación, dirección) ni secreto (wallet_token, push token, cookies,
  Authorization, credenciales de proveedor) llega al proveedor externo de
  observabilidad (Sentry) — ver "Observabilidad" en Arquitectura arriba.

## Convenciones

- Pregunta antes de instalar dependencias nuevas.
- No toques secretos ni los subas al repo; usa variables de entorno.
- **Toda pantalla/action de feature** (`apps/web/app/(product)/`,
  `/admin`, `/enroll`): la lógica vive en `logic.ts` (SIN `"use server"`,
  recibe la sesión ya resuelta como parámetro — en un archivo
  `"use server"` quedaría expuesta como endpoint invocable con una sesión
  forjada) y `actions.ts` es un shim que resuelve la sesión desde cookies
  verificadas y la pasa a `logic.ts`. Primitivos compartidos en
  `apps/web/lib/tenant.ts`: `findInTenant` (lectura por id anti-IDOR —
  un id de otro tenant devuelve exactamente lo mismo que uno
  inexistente) y `resolveActor` + `writeAuditLog` (audit con
  `actor_user_id`, NUNCA `actor_auth_user_id`, cuya FK apunta a
  `platform_admins` y rechaza actores de tenant). Detalle completo y
  ejemplos: skill `frontend-conventions` — cárgala siempre antes de tocar
  una pantalla de feature.
- Dentro de un mismo `tx` de `withTenantContext`, si hay varias queries
  agregadas, awaitéalas SECUENCIALMENTE — nunca `Promise.all`. Un `tx` es
  una sola conexión Postgres, no soporta queries concurrentes (bug real ya
  cometido y corregido; síntoma: `DeprecationWarning` de `pg`).
- Nunca dejes trabajo lento que NO toca la DB (fetch de red, firma
  criptográfica, cualquier CPU-bound) corriendo dentro de un `withTenantContext`
  — mantiene una conexión del pool ocupada de brazos cruzados (hallazgo real:
  `generateApplePkpassForCustomer` tardaba 2-3s con la conexión abierta todo
  ese tiempo; ver docs/HISTORY.md, "Auditoría de rendimiento"). Patrón:
  separa en una función que SOLO lee/escribe DB (dentro del `tx`, devuelve
  datos planos) y otra que hace el trabajo lento (fuera del `tx`, sin
  recibirlo como parámetro — así es estructuralmente imposible tocar
  Postgres por accidente ahí).
- Alta de negocio nuevo en producción (script + branding + programa
  placeholder): skill `tenant-onboarding`, patrón ya usado dos veces, no
  reinventarlo.
- Cambios de esquema/migraciones: usa el subagente `db-migrations`.
  Revisión de seguridad multi-tenant tras tocar acceso a datos: usa el
  subagente `tenant-security-reviewer` — siempre antes de dar por lista
  una tarea que toque acceso a datos o `/admin`.
