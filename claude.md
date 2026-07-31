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

**FASE 4 — Integración Wallet (Apple + Google), código completo**: toda
dependencia de proveedor (firma de `.pkpass`, envío APNs, firma del JWT de
Google) vive detrás de una interfaz con dos impls — REAL y FAKE — resueltas
por `resolveWalletConfig()` (`packages/wallet/src/config.ts`), un guard
todo-o-nada por proveedor: si faltan una o más de las variables
`WALLET_APPLE_*`/`WALLET_GOOGLE_*`, cae a la fake y lo loguea (INFO si no
hay ninguna — el estado esperado en dev/CI; WARN si hay una config
parcial). Meter las credenciales reales después no cambia ninguna línea de
lógica, solo activa la rama real — ver `docs/WALLET-SETUP.md` para el
checklist exacto de qué conseguir y en qué variable va. `packages/wallet`
(paquete aislado, sin Next.js/DB) trae el firmador PKCS#7 real
(`node-forge`, nunca `openssl` en producción — `openssl` solo se usa como
utilidad de TEST para generar un certificado autofirmado que ejercita el
pipeline de firma real byte a byte), el cliente APNs real (JWT ES256 con
llave `.p8`, payload vacío — Apple no manda datos por push, solo le dice al
dispositivo que pida el pase de nuevo), y el cliente de Google Wallet real
(JWT de cuenta de servicio vía `jose`, insert-o-patch contra la Wallet
REST API, y el JWT firmado del link "Add to Google Wallet" — con
`setExpirationTime("15m")`, porque ese link embebe el `wallet_token` del
cliente en claro dentro del JWT firmado). El fake de Google reusa el 100%
del código de firma/REST real — solo el transporte (`fetch`) está
simulado, con una cuenta de servicio de prueba generada en memoria
(`crypto.generateKeyPairSync`, sin `openssl`). Ambos fakes (Apple/Google)
tienen una cota dura de 200 llamadas grabadas por proceso — la fake es el
fallback por defecto también en un despliegue real sin credenciales
todavía, así que un array sin cota sería una fuga de memoria de datos
sensibles (`wallet_token`, `pushToken`) en un proceso long-running.

Modelo (ver skill `wallet-integration`): un issuer de plataforma, una
plantilla/clase por negocio, un pase individual por cliente — mismo
`wallet_token` opaco que ya resuelve el scanner, nunca un token nuevo. El
web service PÚBLICO de Apple PassKit (`apps/web/app/api/wallet/apple/`,
protocolo fijo de 5 endpoints) no tiene sesión de Supabase: la identidad es
100% el `authenticationToken` embebido en cada pase, verificado en
`lib/wallet/passAuth.ts` — el SEGUNDO (y único otro) punto sancionado para
producir un `VerifiedBusinessId`, con `adminDb` acotado a una sola fila
(match por id + `crypto.timingSafeEqual` sobre el token) antes de pasar a
`withTenantContext`/RLS para todo lo demás. `listUpdatedSerialsForDevice`
es la única excepción documentada adicional a `adminDb` fuera de rutas
confinadas: el protocolo de Apple no manda `authenticationToken` en ese
endpoint (un dispositivo puede tener pases de varios negocios), así que se
resuelve con una query acotada a solo `serialNumber`+`updatedAt` (ningún
dato de negocio/cliente). El guard permanente de "cero `adminDb` fuera de
`/admin`" (Fase 2) y el de casts a `VerifiedBusinessId` se extendieron para
cubrir `lib/` (antes solo `app/`) con un allowlist explícito de estos dos
archivos.

La entrega autenticada (`/customers/{id}/wallet/apple`, sesión de tenant
normal + `findInTenant`) y el botón de Google
(`GoogleWalletButton`, Server Component que revalida su propio tenant, no
confía en el prop del padre) comparten `lib/wallet/loyaltySnapshot.ts`
(una sola fuente de negocio+cliente+programa+balance+recompensa, contenido
mínimo — nunca apellido/teléfono/email, igual que Apple) y usan
`ensureWalletPass()` para crear la fila de `wallet_passes` la primera vez
que se pide un pase (antes de Fase 4, nada en producción creaba esa fila).
El hook post-transacción (`lib/wallet/notify.ts`,
`notifyWalletOfTransaction`) corre DESPUÉS de que la transacción de
sello/canje ya confirmó (nunca en un replay, nunca si el commit no pasó) —
best-effort real: Apple recibe un push vacío por dispositivo registrado
(reintentos con backoff, cada dispositivo aislado en su propio `.catch()`);
Google recibe un `upsertLoyaltyObject` (PATCH) solo si el cliente ya tiene
un pase de esa plataforma. Se invoca envuelto en `scheduleAfterResponse()`
(`after()` de `next/server`, con fallback a fire-and-forget fuera de una
request real — necesario porque toda la suite de tests llama `logic.ts`
directo, sin request real, mismo patrón que ya resolvió Fase 1 con
`cookies()`). Definición de "listo" cumplida:
`apps/web/tests/wallet-webservice.test.ts` (tenant-scoped por
authenticationToken, token de B contra pase de A → 401 uniforme, idempotencia
de registro, `passesUpdatedSince` respetado), `wallet-notify.test.ts`
(un sello real encola exactamente un push/PATCH, replay no dispara nada,
un push que falla no revierte el balance ya confirmado) y
`wallet-delivery.test.ts` (`.pkpass` real no vacío, IDOR en la descarga,
JWT de Google con classId/objectId/origin correctos) — más los tests
propios de `packages/wallet` (config, firma real con cert autofirmado,
JWT de APNs, `pass.json`/Loyalty Class-Object sin PII de más, bundle
`.pkpass`). Revisión `tenant-security-reviewer` (dos pasadas, cubriendo
código distinto cada vez): la primera sobre esquema/adaptadores/web
service (3 MEDIUM + 6 LOW, todos corregidos o documentados); la segunda
sobre el hook y la entrega (1 MEDIUM + 5 LOW) — el MEDIUM real: el pase de
Google nunca quedaba registrado en `wallet_passes`, así que
`notifyWalletOfTransaction` nunca encontraba a quién actualizarle tras un
sello (corregido: `googleSaveLink.ts` ahora llama `ensureWalletPass` antes
de armar el link). Cero hallazgos críticos/altos en ambas pasadas.

**Residual de Fase 4** (no es código, son trámites externos — ver
`docs/WALLET-SETUP.md` para el detalle completo): Apple Developer Program
(de pago, ~$99/año, Pass Type ID + certificado de firma + llave APNs
`.p8`), cuenta de servicio de Google Cloud + Wallet API + issuer ID
(gratis, alcanza para modo demo `[TEST ONLY]`), y aprobación de
publicación de Google (gratis, con revisión) para producción real sin esa
marca. Sin esas credenciales, todo corre con las impls fake — válido
estructuralmente, pero un iPhone real rechaza el certificado no confiable
y Google Wallet mantiene la marca de prueba. Verificación en dispositivo
real (instalar, sellar y ver la actualización en vivo) queda pendiente
hasta que existan esas credenciales — ver la sección "Verificación
pendiente" de `docs/WALLET-SETUP.md`.

## Fase actual: sin definir todavía
FASE 2b (`/enroll` público para que el cliente final se dé de alta solo,
con su propio QR) y reportes/analítica son los candidatos — ninguna de las
dos está acotada. No las empieces sin pedir el alcance primero — misma
regla que rigió Fase 0 → 1 → 2 → 3 → 4.

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