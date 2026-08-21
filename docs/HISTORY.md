# Historial del proyecto

Narrativa completa de cada fase y ronda de trabajo: qué se decidió, qué
bugs se encontraron y cómo se resolvieron, iteración por iteración. Es la
memoria detallada del proyecto — `claude.md` en la raíz del repo tiene
solo lo esencial y vigente (misión, arquitectura, reglas no negociables,
convenciones); este archivo tiene todo lo demás, para que no se pierda
nada sin tener que cargarlo en cada turno de cada sesión.

No es la fuente de verdad de "qué existe hoy en el código" — para eso,
lee el código y `git log`. Es la fuente de verdad de "por qué es así" y
"qué ya se intentó".

Orden: cronológico, de más viejo a más nuevo.

## Fases completadas

**FASE 0 — Cimientos**: esquema + migraciones de las tablas core (todas con
business_id), políticas RLS por business_id en toda tabla tenant, rol
`app_user` sin BYPASSRLS. Definición de "listo" cumplida:
`packages/db/tests/isolation.test.ts` prueba que un negocio no puede leer ni
escribir datos de otro.

**FASE 1 — Auth real, tenencia real, alta de admin, shell del dueño**:
Supabase Auth (ver Arquitectura en `claude.md`) con un custom access token
hook (`packages/db/migrations/0010_supabase_auth_bridge.sql`) que inyecta
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

> Nota (posterior): el modelo de `platform_admins` evolucionó de un boolean
> puro a dos roles (`owner`/`viewer`) con impersonación real — ver "Panel
> de administración de plataforma" más abajo. El claim `is_platform_admin`
> descrito aquí se conserva tal cual en el JWT, solo dejó de ser la única
> señal.

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

**Residual de Fase 4 — YA RESUELTO, credenciales reales en producción**
(esta sección decía "pendiente"; quedó desactualizada sin que nadie la
corrigiera al pasar — ver `docs/WALLET-SETUP.md` para el detalle
completo y el checklist original). Apple Developer Program (Pass Type ID
+ certificado de firma + llave APNs `.p8`) y la cuenta de servicio de
Google Cloud + Wallet API + issuer ID están cargados en el entorno de
producción (Vercel) desde antes de esta sesión — ambas ramas reales
activas, ya no fake. Google sigue en modo `[TEST ONLY]` (la aprobación de
publicación, gratis pero con revisión de Google, no se ha pedido
todavía — no bloquea nada del código, solo esa marca visual).
Verificación en dispositivo real: **confirmada** con evidencia real, no
solo con las impls fake — instalación de un `.pkpass` real en un iPhone,
push automático tras un sello real (sin reinstalar, protocolo
`GET /registrations` → `GET /passes/{serial}` real, ~6 min de latencia),
y actualización de un Loyalty Object de Google confirmada con `GET` real
contra la API tras un sello real. Genuinamente pendiente todavía (ver
"Verificación pendiente" en `docs/WALLET-SETUP.md`): desregistro de
dispositivo (borrar el pase en un iPhone y confirmar que
`device_registrations` pierde la fila), instalación en un Android real
(todo lo de Google se verificó por API directa, nunca en un dispositivo
Android físico), y un cross-check visual de aislamiento entre tenants con
credenciales reales (ya cubierto por tests automatizados con las impls
fake; falta solo la confirmación visual).

## Notificación por proximidad (geofence) — Apple + Google, en producción

Primera activación real de lo que en Fase 4 era solo scaffolding: nueva
columna `locations.latitude`/`longitude` (nullable, migración `0022`),
backfill de las coordenadas reales de las 3 sucursales de CHILAQUIKES
(Local + 2 foodtrucks). Apple: `passGeneration.ts` arma el array
`locations` del pase con `relevantText` DINÁMICO (`buildRelevantText`,
usa el nombre de la próxima recompensa + nombre del cliente reales del
snapshot en el momento de generar el pase, nunca texto fijo) + un
`iconPng` real derivado del logo del negocio. Google: `googleSaveLink.ts`
pasa `merchantLocations` — como es un campo de la Loyalty CLASS (no del
objeto), cada cambio exige un `classId` nuevo (mismo criterio de siempre:
Google cachea agresivamente por classId, nunca un PATCH in-place de la
clase vieja — ver `CURRENT_GOOGLE_LOYALTY_CLASS_VERSION` en
`packages/wallet/src/google/loyaltyPayload.ts` y los scripts
`packages/wallet/scripts/migrate-google-class-v*.ts`, uno por cada bump,
cada uno con el snapshot de clientes reales que migró).

**Reducido a solo la sede fija** (`_v7`, tras `_v6` que activó las 3):
sin control server-side de frecuencia — ni Apple ni Google avisan a
nuestro servidor cuando el geofence dispara; la evaluación es 100% local
del dispositivo contra los datos ya sincronizados del pase, así que no
hay ningún punto donde contar u observar el trigger para limitarlo (un
"máximo 1 notificación/día" pedido explícitamente **no se implementó** —
técnicamente no hay dónde engancharlo). Con el aviso persistiendo
mientras el dispositivo esté dentro del radio, el negocio decidió que
solo tiene sentido para el local fijo, no las 2 sucursales móviles
(foodtrucks) — sus filas en `locations` conservan `latitude`/`longitude`
en `NULL`, no se borraron.

Separado de esto: `buildNotificationMessage`/`addMessage` (Google) sigue
siendo scaffolding sin caller real todavía (ver el comentario en
`packages/wallet/src/google/loyaltyPayload.ts`) — es la notificación PUSH
disparada por el SERVIDOR tras un sello (mensaje de progreso), no el
aviso nativo por ubicación que ya está activo. No confundir los dos.

**Staff real por sucursal**: `apps/web/scripts/create-chilaquikes-employees.ts`
(script de un solo uso, corrido contra producción) dio de alta las 3
cuentas de staff reales de CHILAQUIKES, una por sucursal
(`colon@chilaquikes.pragmia-data.com`, `torrente@…`, `calasanz@…`), cada
una con `employees.primary_location_id` fijo a su sucursal — mismo patrón
de contraseña generada localmente (nunca en texto plano en un log
persistente) e idempotencia (un email que ya existe en `auth.users` no se
toca) que los scripts de migración de Google.

## Superficie pública de marketing (paralela a las fases)

Landing pública en `apps/web/app/(marketing)/` (route group — no cambia
las URLs): `/` (antes un stub de Fase 0, ahora la landing) y
`/privacidad`. "Precios" ya NO es una ruta aparte — se eliminó `/precios`
y su contenido (los 3 planes + la comparativa completa detrás de un
`<details>` colapsado) vive inline en `/` como la sección ancla
`id="precios"`; el nav superior solo ancla ahí o navega al footer, nunca
a una página separada. Vende la plataforma bajo el nombre **Pragmia**; el
producto en sí sigue siendo el mismo (`/dashboard`, `/scanner`, etc., sin
tocar). Trabajo deliberadamente separado de las fases numeradas: sin
datos de tenant, sin sesión, sin RLS que aplique — el copy sale de
`wallet-bi-plans.md` (raíz del repo) traducido a
`apps/web/lib/marketing/content.ts` (módulo tipado, nunca strings sueltos
en JSX). Sin registro self-service (onboarding sigue siendo manual/demo).

**Regla de caché — el OPUESTO exacto de la regla de Fase 3**: el service
worker nunca cachea HTML de producto porque puede llevar datos de tenant
(ver Reglas NO negociables en `claude.md`). Las páginas de `(marketing)`
son al revés: deben ser estáticas, cacheables e indexables por diseño —
nunca llaman `cookies()`/`headers()`/`getVerifiedSession()`/
`requireTenantSession()`, que es justo lo que las deja renderizar
estáticas por defecto en Next (confirmado con `next build`: `/` y
`/privacidad` salen ○ Static, el resto del producto sale ƒ Dynamic). No
hay conflicto con el service worker: su allowlist ya son solo los dos
íconos, así que nunca intercepta estas rutas nuevas.

El CTA de demo (WhatsApp + formulario) escribe en `marketing_leads`
(`packages/db/src/schema/marketingLeads.ts`), una tabla deliberadamente
FUERA del modelo tenant: sin `business_id`, sin RLS (un lead se captura
ANTES de que exista ningún negocio). Escrita por `app_user` con GRANT
`INSERT` únicamente (nunca `adminDb` — regla no negociable de "el rol de
servicio nunca sirve una request normal" — ver `packages/db/src/marketing.ts`,
superficie separada del mismo modo que `admin.ts`). `/sitemap.xml` y
`/robots.txt` (App Router) listan solo estas tres rutas; todo lo demás
(`/dashboard`, `/admin`, `/scanner`, `/customers`, `/rewards`, `/api`)
está explícitamente en `disallow`. Aviso de privacidad (`/privacidad`)
es un BORRADOR estructurado para LFPDPPP, marcado como tal en un
comentario de código — pendiente de revisión legal antes de publicar.

## Rediseño de producto — identidad visual, app shell, dashboard, landing (branch `feat/design-overhaul`)

Trabajo de PRESENTACIÓN puro, encima de los primitivos tenant-scoped ya
existentes (`findInTenant`, `resolveActor`, `withTenantContext`,
`requireTenantSession`) — ninguna query de tenant cambió de forma, ningún
by-id dejó de ser anti-IDOR, RLS/auth/cache intactos. Verificado con
`tenant-security-reviewer` (limpio, sin hallazgos críticos/altos/medios) y
la suite completa (212 tests) corrida 3 veces seguidas sin flakiness antes
de cada merge. Ya **mergeado a `main`** (rango `dd22735..3b6d61b`); la
branch `feat/design-overhaul` sigue viva para trabajo de seguimiento.

**Rebrand**: el producto se vendía como "IGA Analytics" (borrador
original en `wallet-bi-plans.md`, raíz del repo — ese archivo NO se
edita, sigue diciendo el nombre viejo a propósito, es la fuente de copy
histórica). Ahora es **Pragmia** en toda la UI y el contenido
(`apps/web/lib/marketing/content.ts`, módulo tipado — nunca strings
sueltos en JSX). Contacto real: WhatsApp `+52 229 339 1514`
(`CONTACT.whatsappNumberDigits`, wa.me), correo `admin@pragmia-data.com`.
Regla permanente: cero menciones a "Wallet BI"/"IGA Analytics" en
cualquier archivo bajo `apps/web/app/` o `apps/web/lib/` — solo
comentarios de código que referencian el nombre del `.md` fuente pueden
mencionarlo.

**Identidad visual — dirección "Sello" (histórica, reemplazada después
por Pragmia, ver esa sección más abajo)**: el objeto real detrás del
producto es la tarjeta de sellos física; el sistema visual la digitaliza
en vez de inventar un lenguaje nuevo. Tokens en `apps/web/app/globals.css`
(Tailwind v4 CSS-first, `@theme inline` — sigue sin existir
`tailwind.config.js` ni `components.json`): marino `#14213D` (`--primary`,
confianza/documento oficial), coral `#E8573F` (`--stamp`, el ÚNICO acento
de marca — separado de `--accent`, que sigue siendo el tinte neutral de
hover de shadcn), papel `#FBFAF7` (`--background`), `--success`/
`--warning`/`--destructive` semánticos separados del acento. Valores en
hex, no oklch (fidelidad exacta al mockup aprobado, documentado en el
propio CSS). Tipografía: `Space Grotesk` (display) + `Inter` (cuerpo) vía
`next/font/google` en `app/layout.tsx` — auto-hosted, cero request a CDN
de terceros. Radio de borde en escala `sm/md/lg/xl/2xl` (base 1rem,
antes 0.625rem fijo de shadcn). Sombras tintadas de marino
(`--shadow-color`), no negro puro. `apps/web/components/Logo.tsx`:
`LogoMark` (ícono SVG, dos círculos superpuestos) + `Logo` (ícono +
wordmark "Pragmia"). Para gráficas existen tokens SEPARADOS,
`--chart-1`/`--chart-2` (validados con `node scripts/validate_palette.js`
de la skill `dataviz`, luz y oscuro por separado) — **nunca uses
`--primary`/`--stamp` como color de dato en una gráfica**, fallan el
validador de contraste/croma categórico.

**App shell**: route group nuevo `apps/web/app/(product)/` envolviendo
`dashboard/`, `rewards/`, `customers/`, `scanner/` (mover, no recrear —
mismo patrón que ya funcionó para `(marketing)`, no cambia ninguna URL).
Cada `page.tsx` sigue llamando `requireTenantSession()`/
`getVerifiedSession()` de forma independiente para su propio fetch —
`app/(product)/layout.tsx` llama el mismo primitivo UNA vez más, solo
para renderizar el shell (nombre del negocio, email, nav), defensa en
profundidad deliberada, no un cambio de mecanismo. `AppShell.tsx`
(sidebar fija desktop + `Sheet`/drawer móvil), `UserMenu.tsx` (recibe
`email`/`role` como strings, nunca el objeto de sesión), `PageHeader.tsx`
(título + descripción + acciones + breadcrumb `back`, reemplaza los
links sueltos "← Dashboard" de antes). `/login` reconstruido con el
sistema de diseño (mismo `signInWithPassword`, cero cambio de lógica).
`/team` (offboarding de empleados, ver esa sección más abajo) se sumó
después a este mismo route group y a `NAV_ITEMS` — el resto del párrafo
de arriba describe el shell tal como quedó en el rediseño original.

**Dashboard como overview real**: `apps/web/app/(product)/dashboard/logic.ts`
trae las queries tenant-scoped nuevas (clientes activos/inactivos,
nuevos del periodo, visitas, redenciones, próximos a recompensa) más 3
series semanales para gráficas `recharts` (visitas, nuevos vs.
recurrentes, tasa de canje) coloreadas con `--chart-1`/`--chart-2`. Regla
permanente: si varias queries agregadas comparten el mismo `tx` de
`withTenantContext`, awaitéalas SECUENCIALMENTE, nunca `Promise.all` — un
`tx` es una sola conexión Postgres, no soporta queries concurrentes (bug
real cometido y corregido: síntoma fue un `DeprecationWarning` de `pg` en
consola durante verificación en vivo). `StampRow.tsx` (fila de círculos
de sello, usa `stampProgress()` de `@loyalty/core`) reemplaza el viejo
`StampProgressBar.tsx` (eliminado) en dashboard, `/customers/[id]` y
`/scanner`. `EmptyState.tsx` (ilustración SVG propia) y `RouteError.tsx`
son ahora los únicos componentes para estado vacío/error de toda pantalla
de feature.

**Motion — sin dependencia nueva**: todo el movimiento de la plataforma
(landing y producto) es CSS puro — `useSyncExternalStore`/
`IntersectionObserver`/`prefers-reduced-motion`, nunca framer-motion ni
GSAP. Se evaluó explícitamente instalar alguna al elevar la landing y se
decidió que no hacía falta (scroll-reveal sobrio + feedback de botón no
lo justifican). Iconografía: `lucide-react` en toda la plataforma —
establecido desde el app shell, no cambiar de librería a media
implementación.

**Landing pública elevada** (`apps/web/app/(marketing)/`, sigue sin
sesión/RLS/datos de tenant, sigue ○ Static en `next build` — ver regla de
caché arriba, no cambió): además del hero y tokens de marca, la home
rompe la monotonía de "reja de tarjetas blancas" con secciones de layout
variado. `WalletCardMockup.tsx` está parametrizado
(`businessName`/`rewardLabel`/`stampsFilled`/`stampsRequired`/
`accentColor`/`logoSrc`/`compact`) — antes tenía "Café Central" fijo a
fuego.

**Reestructura post-lanzamiento** (`apps/web/app/(marketing)/components/`,
reemplaza por completo la sección original de arriba — `ProductShowcase.tsx`,
`ProblemSection.tsx` y `ComponentsBento.tsx` **ya no existen**, fusionados
en `ProductAndProblem.tsx`; `DashboardGlance.tsx` y `HowItWorksStamps.tsx`
sí siguen): feedback real de marketing tras el lanzamiento. Precios pasa
de ~8va a 3ra posición (muchos usuarios no llegaban al final), nav del
header con anchors a cada sección (antes no coincidía con el orden real
de scroll), botón flotante de WhatsApp (`WhatsAppFloatButton.tsx`, ícono
SVG propio, sin dependencia nueva) al mismo número de contacto de
siempre. `ComparisonMatrix.tsx` (antes tabla de 24 filas) se auditó
contra el código real: quedaron 13 filas — se eliminaron las que no
tienen ninguna implementación detrás (cupones, campañas, segmentación,
exportación, asistente, etc.) en vez de dejarlas como promesa de roadmap;
filas booleanas agrupadas con iconografía check/x y reordenadas, las X
pasan de gris tenue a `text-destructive` (rojo, más visibles), CTA más
notorio. "Avisos por ubicación" pasa a "Sí" sin badge de "próximamente"
(Apple ya en producción real — ver sección de geofence arriba; Google
también tiene `merchantLocations` activo, aunque su feature SEPARADA de
notificación push server-triggered sigue siendo scaffolding). Contacto
real actualizado: WhatsApp `+52 229 339 1514`, correo
`admin@pragmia-data.com` (única fuente `CONTACT` en `content.ts`).

Dos bugs reales de layout del hero (`#producto`) encontrados y corregidos
con Playwright, no visibles por tipos/tests: el celular tapaba ~70% de la
tarjeta de dashboard con el solape cortando texto a medias (fix: más aire
en la composición); un segundo intento redujo el solape pero no lo
eliminó (quedaban 189px tapando media tarjeta — a 1024px, el breakpoint
de 2 columnas, solo había 976px disponibles para ~700px de contenido
real) — fix definitivo: contenedor a `max-w-7xl` solo en esa sección,
breakpoint de 2 columnas sube de `lg` a `xl`, y en `xl+` celular+dashboard
van lado a lado en flujo normal (`flex`+`gap`) en vez de
`absolute`+offset numérico, cero riesgo de overlap por construcción.
`PhoneFrame.tsx`: la píldora del notch se veía mordida por la esquina
redondeada del frame (estaba a 8px del padding-box real); sube y se
angosta para un efecto Dynamic Island real. `DashboardGlance.tsx`: dos
métricas heredaban `text-primary-foreground` (blanco) sobre el bloque
navy — blanco sobre blanco, casi invisible (confirmado con
`getComputedStyle`); fix con `text-card-foreground`, mismo token que ya
usa `Card` de shadcn.

**Previsualizador de tarjeta** (`CardPreviewer.tsx`, sección "Previsualiza
tu tarjeta" en la home): widget 100% client-side, reusa
`WalletCardMockup`. El logo del prospecto se lee con
`URL.createObjectURL` y JAMÁS sale del navegador — nada se sube ni se
guarda, no hay Server Action ni fetch propio de por medio (`FileReader`/
object URL, revocado al reemplazar o desmontar). Valida tipo
(png/jpg/svg) y tamaño (2 MB) con error inline. El CTA final arma un
mensaje de WhatsApp personalizado con el nombre capturado
(`buildWhatsappLink(mensaje)`). Nota de a11y real encontrada y corregida:
el trigger de "Subir logo" NO debe ser un segundo `<label htmlFor>`
apuntando al mismo input que ya tiene su `<Label>` de campo — dos labels
sobre un mismo control concatenan su texto en un solo nombre accesible
confuso; el trigger dispara el click del input vía `ref`, no vía label.

**Verificación de este rediseño**: `next build` confirma que ninguna
página de marketing dejó de ser ○ Static pese a los componentes cliente
nuevos (`RevealOnScroll`, `CardPreviewer` son islas aisladas). Revisado
en vivo con Playwright en desktop y mobile — dos bugs reales de layout
encontrados y corregidos ahí (no los hubiera visto typecheck/lint): texto
de recompensa truncado dentro del marco de teléfono angosto, y el badge
"Próximamente" desbordando el viewport en `HowItWorksStamps` en mobile.

**"Negocio de Prueba" (local, no hosted)**: con visto bueno explícito, se
pobló con datos de demo de "Chilaquikes" — rebrand del negocio, programa
"Club de la Gorrita" (6 sellos), recompensa "Orden de chilaquiles gratis",
2 sucursales, 1 empleado demo, 39 clientes con nombres realistas e
historial de 8 semanas (transacciones/redenciones con fechas explícitas,
no producido por `scanner/logic.ts` — esas funciones siempre usan `now()`
a propósito). Ejecutado vía un script `.test.ts` de un solo uso (mismo
patrón que corre dentro de Vitest para resolver los imports extensionless
de `logic.ts`/`testAuth.ts`), borrado después de correrlo. Sigue siendo el
mismo tenant local de siempre, no un negocio hosted nuevo.

## Pulido de UX del scanner (branch `feat/design-overhaul`)

Capa de UX del cliente sobre la lógica de Fase 3 ya existente — cero
cambio de endpoints, idempotencia, cooldown o checks de tenant/revocación,
la UI solo REFLEJA lo que `scanner/logic.ts` ya decidía.
`ScanResultBanner.tsx` (nuevo): resultado grande a pantalla completa tras
cada sello — verde/`--success` para sello registrado, ámbar/`--warning`
para cooldown (nunca tratado como error), coral/`--stamp` con ícono en
`--primary` para "¡Recompensa disponible!" (destacado especial, sin
auto-reset — el panel con el botón Canjear debe seguir a la vista), rojo/
`--destructive` para "Cliente no encontrado". Siempre ícono + color +
texto, nunca solo color. Auto-reset a los 3.5s (cancelable con un botón
grande "Siguiente cliente") vía **remount por `key`**, no por un efecto
reaccionando a props — evita tanto un `setState` síncrono en el cuerpo de
un efecto (lint `react-hooks/set-state-in-effect`) como depender de
`onReset`, que el padre recrea en cada render.
`apps/web/lib/scannerFeedback.ts`: vibración (`navigator.vibrate`, con
guard — iOS no lo implementa, degrada en silencio) + tono corto por Web
Audio (sin asset ni dependencia nueva), un patrón distinto por estado.
Preferencia de sonido en `localStorage` vía `useSyncExternalStore` (mismo
mecanismo que `useOnlineStatus`), nunca un `useState`+`useEffect` a mano.
Táctil para mostrador: botones clave del scanner subidos a ≥44px.
Cámara: distingue permiso denegado de "sin cámara trasera" con mensaje
específico en cada caso, mismo fallback (USB/búsqueda manual) siempre
visible debajo. Punto 4 original (confirmación de canje a prueba de
errores) **no se implementó todavía** — quedó pendiente de una siguiente
iteración.

## Rebrand "Sello" → Pragmia (branch `feat/design-overhaul`)

La dirección visual "Sello" (marino/coral, Space Grotesk/Inter, papel
cálido) descrita arriba quedó **reemplazada por completo** por la
identidad final de Pragmia — la sección de arriba es historia, no el
estado actual. Fuente de la marca: `pragmia-logo/` en la raíz del repo
(logo.jpeg, icon.jpeg, tipografias.jpeg, colores.jpeg — no trackeado en
git, son artes de referencia, no assets que la app cargue en runtime).
**Los tokens vigentes de esta identidad viven hoy en la skill
`frontend-conventions` — esta sección es solo el registro de cómo se
llegó ahí.**

**Paleta** (`apps/web/app/globals.css`): `--primary` azul `#085AB3`,
`--stamp` celeste `#51CADE`, `--foreground` negro `#000000`, fondo neutro
frío `#F5F8FC` (ya no el "papel" cálido, atado al concepto de tarjeta
física que este rebrand reemplaza). Regla nueva importante: `--stamp`
(celeste) es demasiado claro para leerse como texto/ícono/borde sobre
fondo claro (1.9:1 de contraste, falla WCAG) — solo se usa como RELLENO
con `--stamp-foreground` (negro en claro, casi-negro en oscuro) encima
nunca como `text-stamp`/`border-stamp` sueltos sobre `--background`. Los
usos que antes eran texto/ícono suelto en coral pasaron a `--primary`.
`--chart-1`/`--chart-2` recalculados (`#2E7FC9`/`#EB6834` en claro,
`#3F8AD1`/`#D9702E` en oscuro) y revalidados con
`node scripts/validate_palette.js` de la skill `dataviz` — ALL CHECKS
PASS en los dos modos.

**Tipografía**: `Playfair Display` (display/títulos, reemplaza Space
Grotesk) + `Comfortaa` (cuerpo, reemplaza Inter), identificadas por
comparación visual directa contra `tipografias.jpeg` (no hay forma de
extraer el nombre de fuente de un JPEG con certeza absoluta — se
compararon candidatos de Google Fonts letra por letra antes de aplicar).
Auto-hosted vía `next/font/google` en `app/layout.tsx`, mismo criterio de
siempre.

**Logo/favicon**: `components/Logo.tsx` — `LogoMark` ahora es un PNG
(`public/brand/pragmia-icon.png`, fondo recortado a transparente vía
flood-fill, más una variante `-white.png` para fondos `--primary`, ver
`WalletCardMockup.tsx`), no un SVG a mano: el motivo de anillos
concéntricos + diamante del ícono real es demasiado fino para vectorizar
a ojo sin arriesgar desviarse del arte aprobado — a los tamaños reales de
uso (ícono de sidebar, favicon) un PNG de alta resolución no pierde
nitidez visible. El wordmark "PRAGMIA" sigue siendo texto real (nunca
imagen), en `font-display`. Favicon nuevo en `app/icon.png`, íconos PWA
maskable regenerados en `public/icons/` (blanco sobre azul primario,
zona segura ~62%) — `apps/web/public/sw.js` con bump de `CACHE_NAME`
(`v3`) para que un service worker ya instalado no siga sirviendo el
ícono viejo cacheado indefinidamente (el nombre de archivo no cambió,
solo el contenido).

**Landing**: quitado "Hecho en {ciudad}" de `TrustBar.tsx`.
`WalletCardMockup.tsx` (reusado por el hero, `ProductShowcase` y
`CardPreviewer` — un solo componente) ahora incluye un QR de demo
(`DemoQr`, SVG inline generado offline con la librería `qrcode` a partir
de un string de marca fijo, **nunca** un `wallet_token` real) + una línea
discreta "Hecho con Pragmia". Bug real de layout encontrado y corregido
en el camino (Playwright mobile): `CardPreviewer.tsx` desbordaba
horizontalmente en mobile — un item de grid con `mx-auto` en los dos
lados se dimensiona por `fit-content` en vez de estirarse a la celda
(spec de CSS Box Alignment), y el `max-w-sm` de `WalletCardMockup` como
contenido no cabía en el viewport; el fix fue `w-full` en vez de
`mx-auto` en ese wrapper.

**Bug de plataforma encontrado y corregido, no relacionado al rebrand**:
Next.js 16 bloquea por default el runtime de dev (`next dev`, incluida la
hidratación del cliente) si el `Origin` de la request no está en
`allowedDevOrigins` — ni `127.0.0.1` ni un túnel (`cloudflared`, para
probar en teléfono real) cuentan como "localhost" automáticamente. Sin
esto, el JS nunca hidrata: un `<form>` queda como HTML inerte y un submit
real hace un GET nativo a la misma URL en vez de correr el `onSubmit` de
React — así se manifestó (login que "no hace nada"). Fix permanente en
`apps/web/next.config.mjs`: `allowedDevOrigins: ["127.0.0.1", "localhost",
"*.trycloudflare.com"]`. Solo afecta `next dev`, un build de producción no
tiene este runtime.

**Verificado**: `next build` (marketing sigue ○ Static), lint/typecheck
limpios, suite completa, revisado en vivo con Playwright en desktop
(1440px), tablet (820px) y mobile (390px) — dashboard, scanner, clientes,
programa, landing y el drawer de nav móvil. `tenant-security-reviewer`
confirmó que el diff completo (colores, fuentes, logo, favicon,
`WalletCardMockup`, `ScanResultBanner`, `sw.js`) es presentación pura —
cero referencia a `business_id`/sesión/RLS/`adminDb` en los archivos
tocados.

## FASE 2b — `/enroll` público, en producción

Auto-registro real: el cliente final se da de alta solo, sin staff de por
medio, vía `apps/web/app/(marketing)/enroll/[slug]/` (misma route group
`(marketing)` que la landing — sin sesión, pero a diferencia de la
landing SÍ escribe datos de tenant, así que no puede ser estática:
sale ƒ Dynamic en `next build`, esperado). `businessSlug` llega ya
"bind"eado como argumento parcial de la Server Action desde
`EnrollForm.tsx`, nunca de un campo de `formData` — no puede mandarse un
slug distinto al de la URL que el visitante realmente abrió.

**Seguridad del camino de escritura** (`packages/db/src/enroll.ts`,
superficie separada del resto — cualquier import de `@loyalty/db/enroll`
declara explícitamente "este código escribe clientes SIN sesión de
tenant"): dos funciones Postgres `SECURITY DEFINER`
(`packages/db/migrations/0014_public_enrollment_functions.sql`),
`get_active_business_by_slug` (lookup público, resuelve el negocio
EXCLUSIVAMENTE por slug con `status = 'active'`, nunca por un
`business_id` que el visitante pudiera mandar — cero filas si el slug no
existe o el negocio está suspendido, sin oráculo de existencia) y
`enroll_customer_public` (el INSERT real). `app_user` nunca gana permiso
de escritura directa sobre `customers`/`customer_balances` para este
camino — toda la validación queda encapsulada DENTRO de la función misma
(defensa en profundidad real: la función queda expuesta vía `GRANT
EXECUTE` a `app_user`, así que no confía ciegamente en que el caller de
`apps/web` ya validó). Migración `0015_enroll_age_gate.sql` (hallazgo
MEDIO de revisión) replicó ahí el gate de mayoría de edad (18+, requerido
porque el checkbox de consentimiento LFPDPPP lo firma el propio titular
de los datos) que antes solo vivía en `apps/web` — inconsistente con el
propio principio de la función. Campos: nombre, teléfono, email y fecha
de nacimiento **obligatorios**; ocupación opcional. Dedupe de teléfono
DENTRO del negocio (no global), respaldado por el mismo constraint
parcial que el alta manual.

**Endurecimiento posterior** (rate limiting + cierre de enumeración +
honeypot, ver sección de seguridad más abajo para el resto del patrón):
`enroll_public_ip` en `lib/rateLimit.ts` (5 cada 10 min por IP — la ÚNICA
superficie pública sin sesión del sistema, por eso es el único límite por
IP en vez de por empleado autenticado). `EnrollDuplicatePhoneError` dejó
de confirmar "ese teléfono ya es cliente" (oráculo de enumeración real) —
ahora responde EXACTAMENTE igual que un alta nueva (mismo `success`
shape, sin links de wallet — no hay forma segura de reemitir el pase de
alguien más sin verificar que el visitante es su dueño;
`EnrollConfirmation` ya maneja "sin wallet todavía" con un mensaje
neutro genérico), con un delay fijo de 250ms para acercar el timing al de
un alta real (que sí hace una llamada de red real a Apple/Google — no
elimina el gap de timing del todo, lo acerca). Honeypot: campo oculto
fuera del viewport (no `display:none` — algunos bots revisan el estilo
computado) en `EnrollForm.tsx`; si llega lleno, mismo rechazo silencioso
con la misma respuesta neutra, sin tocar la DB, sin confirmarle al bot
que fue detectado.

Wallet en el auto-registro: `buildWalletArtifactsForNewEnrollment`
(`lib/wallet/publicEnrollWallet.ts`) prepara AMBAS plataformas (Apple y
Google) para todo cliente nuevo, siempre — el frontend
(`detectWalletPlatform()` vía user-agent) solo decide cuál BOTÓN mostrarle
al visitante después, el backend ya generó los dos artefactos de
antemano (importante para lo que dice la sección de perfil de cliente más
abajo sobre qué significa realmente `wallet_passes.platform`).

## Endurecimiento de seguridad — rate limiting, offboarding, búsqueda exacta

Ronda pedida explícitamente para el cliente real en producción, con
"mínimo viable, no complicar" como criterio: priorizar lo que valida
seguridad/RLS, no el pipeline perfecto (ver sección de CI/CD abajo,
mismo criterio).

**Rate limiting distribuido** (`apps/web/lib/rateLimit.ts`, Upstash
Redis vía `@upstash/ratelimit`/`@upstash/redis`): reemplaza — sin
borrarlo, queda como pre-filtro barato de un solo proceso detrás del
chequeo real — al limitador en memoria que ya existía solo para el
lookup del scanner. Fail-open uniforme (permite + advertencia logueada
una sola vez por proceso) si Upstash no está configurado o falla en
runtime — nunca fail-closed, evita que un Upstash caído tumbe el scanner
completo. Cubre: scan/sellado (dos keys independientes, por empleado Y
por negocio — una key compuesta nunca detectaría varios empleados
comprometidos del mismo negocio actuando en paralelo), búsqueda de
clientes (agresivo, por empleado), y los 3 endpoints autenticados del web
service de Apple (por IP, ver `lib/clientIp.ts`, corre ANTES de
`extractBearerToken`).

**Piso de 30s entre sellos** (`MIN_STAMP_GAP_SECONDS` en
`scanner/logic.ts`): `Math.max(program.cooldownSeconds, 30)` — convive
con el cooldown configurable por programa, nunca lo acorta. Medida
temporal hasta un cap de 1 sello/día (no implementado todavía).

**Búsqueda de clientes a match exacto**: `searchCustomers` cambió de
`ILIKE` con comodines a `eq(lower(...), lower(...))` — tradeoff de UX
real y aceptado (buscar "Mari" ya no encuentra "María González"), pedido
explícito para cerrar una superficie de enumeración sin rate limit
agresivo previo.

**Offboarding real de empleados** (`/team`, ruta nueva — no existía
ninguna gestión de empleados antes de esta ronda): acción `Desactivar`
(dueño/admin únicamente) que, en una sola transacción, apaga
`employees.is_active` y `users.is_active`, audita, y — best-effort,
DESPUÉS de que la transacción ya confirmó — bloquea el login futuro vía
Admin API (`lib/employeeOffboarding.ts`, `banEmployeeAuth`). Esta fue la
**primera excepción documentada** a "cero `adminDb` fuera de `/admin`"
para la superficie de Auth (no Postgres — `createAdminClient()` es la
API de administración de Supabase Auth, distinta de `adminDb`, pero el
mismo espíritu de la regla aplica): confinada a archivos nombrados
explícitamente, con un test estático permanente en
`prod-readiness.test.ts` que enumera los únicos archivos autorizados a
importar `createAdminClient` — un uso futuro fuera de esa lista falla el
test, no queda en un comentario (esa lista creció después con el panel de
admin — ver esa sección más abajo). No revoca un access token YA emitido
y vigente (imposible con JWT stateless, ver Arquitectura) —
`requireOperationContext` ya protege sellar/canjear al instante; el resto
de las rutas queda expuesto hasta que ese token expire (≤1h), riesgo
aceptado explícitamente para esta ronda. Sin acción de reactivar todavía
en esta ronda (deactivate-only, pedido así — el alta real de staff se
agregó después, ver panel de admin).

Revisión `tenant-security-reviewer`: sin hallazgos críticos/altos (1
MEDIO — cobertura del guard de `createAdminClient` en `components/`, y 1
BAJO — supuesto de proxy de confianza en `x-forwarded-for` para
`clientIp` — ambos corregidos antes de mergear).

## CI/CD — GitHub Actions + branch protection

CI corría desde el primer commit del repo pero fallaba siempre —
confirmado con `gh run list` contra varios merges reales seguidos, no
asumido. Causa raíz real: `postgres:16` suelto (con un stub manual del
schema `auth` para que las MIGRACIONES corrieran) nunca tuvo un GoTrue
real corriendo, así que cualquier test que hiciera login/`admin.createUser`
real —la mayoría de `apps/web/tests`— fallaba con
`NEXT_PUBLIC_SUPABASE_URL` sin resolver. El orden corepack→setup-node y
el uso de `--env-file-if-exists` en el script de migrar YA estaban bien
antes de este fix — no eran el problema real, a pesar de estar
documentados como sospechosos.

Fix: `.github/workflows/ci.yml` usa `supabase start` (Supabase CLI real,
pinneada a la misma versión que local) en vez del contenedor suelto —
mismo `supabase/config.toml`/puertos que local dev, recortado con `-x` a
solo los contenedores que este proyecto usa (postgres/gotrue/kong/
postgrest — sin storage/realtime/imgproxy/mailpit/studio/analytics/
pooler). Env vars del job son las mismas claves JWT demo fijas de
`.env.example` (no son secretos reales — Supabase CLI las genera
idénticas en cualquier `supabase start` con el JWT secret default de
cualquier máquina).

**Branch protection**: ruleset activo en GitHub para `main` — requiere
que el check `build-and-test` (el nombre del job en `ci.yml`, sin
`name:` override, así que coincide exacto con lo que el ruleset busca)
pase antes de permitir merge, más "up to date before merging" y bloqueo
de force-push. Confirmado en vivo con una PR real: `mergeStateStatus`
pasa de `BLOCKED` a `CLEAN` en cuanto el check termina en verde, sin
intervención manual.

## Perfil de cliente — cumpleaños, teléfono, ocupación

Las columnas (`date_of_birth`, `occupation`, `phone` ya separado del
usado para login) ya existían en el schema de una ronda anterior —
nullable, sin default, cubiertas por la misma política RLS de fila única
(`business_id`), sin policy nueva. Lo que faltó en su momento fue el
punto de captura y de vista:

- **Alta manual** (`/customers`): teléfono y cumpleaños son obligatorios
  (mismo criterio que ya usaba `/enroll` desde antes — ver sección de
  FASE 2b arriba); ocupación se queda opcional. Un ripple mecánico tocó
  ~18 fixtures de test en 5 archivos (todas las que creaban clientes solo
  con `fullName`).
- **Ficha de cliente** (`/customers/[id]`): muestra cumpleaños (con año
  completo — un bug de display, no de datos: el año siempre estuvo en la
  columna `date`, nunca se mostraba), ocupación (si la dieron), y la
  sucursal de su PRIMER SELLO real (`transactions.location_id`, ya se
  registraba por cada visita) como proxy honesto de "sucursal de alta" —
  deliberadamente NO se agregó un campo/migración nueva para esto, y
  deliberadamente NO se usó geolocalización por IP (impreciso, y una
  inferencia de ubicación que no hacía falta pedir — decisión explícita
  tras plantear la alternativa).
- **Wallet en la ficha — dos iteraciones hasta quedar honesto**:
  `wallet_passes.platform` NO significa "el cliente usa esta
  plataforma" — `/enroll` prepara Apple Y Google para todo cliente nuevo
  sin importar su dispositivo real (ver FASE 2b arriba), y cada botón de
  descarga manual crea su propia fila. La única señal de instalación
  CONFIRMADA es Apple (`device_registrations`, solo tiene fila cuando el
  dispositivo real llamó al web service de PassKit tras tocar
  "Agregar") — Google no tiene ningún callback equivalente en este
  código. Primera iteración: "Apple Wallet · Google Wallet (link
  generado, sin confirmar)" — el calificador al final se leía como si
  aplicara a ambos (hallazgo real: así lo interpretó el dueño del
  negocio). Fix: cada wallet lleva su propio estado, "Apple Wallet
  (confirmado)" / "Google Wallet (sin confirmar)".
- **Bloque de entrega manual del pase** (los botones al pie de la
  ficha): siguen siendo funcionalidad REAL, no un artefacto de
  desarrollo — es el único mecanismo para que staff entregue el pase a
  un cliente dado de alta manualmente (no vía `/enroll`). Solo se limpió
  la copy stale de "Fase 4, en construcción, sin credenciales reales
  todavía" (ya no aplica) y el sufijo "(prueba)" de ambos botones.
- Se borró `/api/debug-wallet-apple-locations-test`: ruta pública sin
  auth que generaba un `.pkpass` real firmado con credenciales de
  producción, quedó expuesta desde la sesión que activó el geofence —
  su propio comentario ya decía "borrar una vez confirmada la prueba".

Apple pass, dos ajustes de polish en el mismo período: "Powered by
Pragmia" volvió a la cara del pase (`secondaryFields`, último slot —
comparte lugar con "Recompensas disponibles" cuando hay 2+ desbloqueadas,
no conviven; `backFields` lo sigue teniendo siempre, sin condición, ese
panel no compite por espacio); y el strip visual (`strip-N.png`,
`N` = sellos llenos) se regeneró para `stamps_required = 8` tras
corregir el dato real de Chilaquikes en producción (era 6).

## Motor de lealtad — tope de recompensa vs. ciclo del programa

Bug real activo en producción, no solo teórico: `program.stampsRequired`
(el grid del pase de Wallet + progreso) y `rule.stampsRequired` de cada
recompensa (lo que `evaluateRedemption`/`applyRedemption` usan para
decidir el canje) eran independientes sin validación entre sí. Con
Chilaquikes en 8/6 (el programa pedía 8 sellos, la recompensa costaba
6), un cliente veía "¡Ya puedes canjear!" con el grid todavía en 6 de 8
sin llenar. Fix: `saveRewardRuleForSession` rechaza, tanto en alta como
en edición, cualquier `stampsRequired` de recompensa mayor al del
programa — el ciclo ya se reinició antes de llegar ahí. UI
(`/rewards`): con exactamente una recompensa activa, su campo "Sellos"
pasa a ser texto plano ("6 (igual al ciclo del programa)") en vez de un
`<input readOnly>` que se leía como un campo editable roto — el valor
sigue viajando al submit vía un input oculto, sin tocar validación. Con
2+ recompensas activas (niveles reales) el campo sigue editable, con el
tope marcado en vivo. El dato real de Chilaquikes en producción ya se
corrigió por separado, directo contra la DB hosted.

## Paginación real de `/customers`

El directorio dejó de ser "trae 50 y ya" — `searchCustomers` acepta
`{page, pageSize}` (default 1/25) con `.limit().offset()` real;
`countCustomers` nueva hace un `COUNT` tenant-scoped sobre el MISMO
`WHERE` que `searchCustomers` (factorizado en `customerSearchWhere`), así
el total de páginas sale de los resultados YA FILTRADOS, nunca del total
sin filtrar del negocio ni de traer todo al cliente para contarlo. Ambas
queries corren SECUENCIALMENTE dentro del mismo `tx` (nunca
`Promise.all` — regla ya establecida, un `tx` es una sola conexión).
Selector de tamaño de página (25/50/100) y controles Anterior/Siguiente
por navegación GET, sin JS de cliente. Buscar resetea a página 1 pero
preserva el tamaño elegido.

## `/set-password` — sistema de diseño

Página de invitación (donde cae el dueño tras el link de email) seguía
con HTML sin estilo desde antes del rediseño de producto — se le aplicó
el mismo patrón que `/login` (Logo + Card de shadcn) y se agregaron los
2 estados que faltaban: cargando (mientras se procesa el fragmento
`#access_token` y se llama `setSession`) y link inválido/expirado (Alert
dedicado, en vez de un formulario que nunca se puede enviar). Cero
cambio a la lógica de auth ya documentada (flujo implícito, no PKCE —
ver el comentario en el propio archivo). Verificado en vivo con
Playwright y una sesión real (no simulada): los 3 estados, incluido el
submit real (`updateUser` + redirect).

> Nota (posterior): esta página se endureció otra vez en la ronda del
> panel de admin — ver "Panel de administración de plataforma" más abajo,
> hallazgo ALTO de `setSession()` prematuro.

## Datos de producción — limpieza de perfiles de prueba

Auditoría de perfiles reales de producción encontró 3 cuentas que eran
puramente de desarrollo mezcladas con las reales de CHILAQUIKES
(`test@testdev.com`, `empleado@gmail.com`, ambas staff sin ficha de
`employees`) y un negocio "Negocio de Prueba" completo (solo su dueño,
`owner-prueba@iga-analytics.mx`, sin ningún cliente/programa/sucursal —
vacío en la práctica). Se eliminaron de producción (fila de `public` +
cuenta de `auth.users`, en ese orden) tras confirmar que no tenían
ninguna fila referenciada en `transactions`/`redemptions` que pudiera
romper una FK. Nota: el "Negocio de Prueba" LOCAL (no hosted, ver la
sección de datos demo de Chilaquikes arriba) es un tenant completamente
distinto — sigue existiendo, es intencional, vive solo en el Supabase
local de cada desarrollador.

## Bugs reales en el `.pkpass` de Apple — key duplicado + falta Last-Modified

Encontrados durante la verificación end-to-end del broadcast de
promociones contra Apple/Google reales (ver esa sección), NO por
código nuevo de esa feature — ambos preexistían y afectan a **todo**
pase de Apple generado por la plataforma, Chilaquikes incluido. La
evidencia fue el propio dispositivo (`POST /v1/log`, que Apple manda
solo y que ya capturábamos sin haberle prestado atención hasta ahora):

1. `packages/wallet/src/apple/passJson.ts`: `secondaryFields` y
   `backFields` compartían literalmente `key: "poweredBy"` — Apple
   exige keys únicos en TODO el pase, no solo dentro de cada grupo de
   campos. Introducido en la ronda de "Apple pass, dos ajustes de
   polish" (ver arriba, cuando "Powered by Pragmia" se agregó a
   `secondaryFields` sin notar que `backFields` ya lo tenía). Device
   log real: *"more than one field has the key 'poweredBy'. Field keys
   must be unique. This will be treated as an error in a future
   release."* Fix: la instancia de `secondaryFields` pasa a
   `poweredBySecondary` (`backFields` conserva `poweredBy`, es la
   incondicional/permanente).
2. `apps/web/app/api/wallet/apple/logic.ts` (`getLatestPass`): la
   respuesta de `GET /v1/passes/{type}/{serial}` nunca mandaba
   `Last-Modified`, exigido por el protocolo de PassKit. Device log
   real: *"Server returned the pass data... but did not provide a
   'last-modified' header."* Fix: se usa `wallet_passes.updated_at`
   (misma fuente que ya alimenta `passesUpdatedSince`).

Impacto real más allá del broadcast: como el (1) es un problema del
`pass.json` en sí y el (2) es de la respuesta del web service, ambos
corren en **cada** `GET /v1/passes/...` — es decir, también en el
flujo normal de sello/canje (`notify.ts`, ya existente desde Fase 4),
no solo en el broadcast nuevo. Ningún campo que cambia en un sello
normal (contador de sellos, strip) lleva `changeMessage`, así que esto
nunca se manifestó como "no llegó el banner" para clientes reales —
se manifestaría, si acaso, como una actualización silenciosa de
sellos que el dispositivo tarda en reflejar o descarta. Validación
pendiente contra clientes reales de Chilaquikes (no solo el negocio
de prueba aislado) para confirmar que el fix no dejó ningún caso
suelto ahí.

## Alta real de IRIZ STYLE — segundo tenant en producción

Segundo negocio real de la plataforma (`business_id`
`fc2b93bb-01ca-43f9-9edf-0782abb514b4`, slug `iriz-style`, comercialización
de calzado), dado de alta con el mismo patrón ya usado para Chilaquikes:
`/admin` no tiene UI para nada más que negocio+dueño (`businessName`/
`ownerEmail`), así que sucursal, RBAC extra y branding se resuelven a
mano contra prod — `apps/web/scripts/create-iriz-style-business.ts`
replica la transacción real de `createBusinessWithOwner`
(invita al dueño vía `inviteUserByEmail`, imprime el SQL idempotente para
correr con `supabase db query --linked`, ya que no hay `DATABASE_URL` de
prod legible localmente) y `create-iriz-style-staff.ts` da de alta una
credencial **temporal** rol `admin` (Narciso, QA) — documentada como tal,
pendiente de revocar/rotar. Dueño real: Sergio Cardenas
(`iriz.pedidos@gmail.com`). Sucursales: `CocoraShowroom` (física) y
`En línea` (agregada después — Iriz también vende por WhatsApp/redes,
sin ubicación física; sin esta fila el scanner no tiene qué sucursal
asignarle a una venta en línea).

> Nota: este patrón de alta (scripts `create-<negocio>-business.ts` +
> `create-<negocio>-staff.ts`) es ahora la skill `tenant-onboarding` — ver
> ahí para el procedimiento repetible, no reinventarlo con el próximo
> cliente.

`brand_color_hex = #000000`: la paleta de marca real que mandó el
cliente (`#d7c8f4`/`#a0d8d8`/`#f6a6a6`/`#b3d9ff`) es toda pastel clara —
`passGeneration.ts` usa un `foreground`/`label` CLARO fijo pensado para
fondo oscuro (ver Fase 4), así que cualquiera de esos pasteles de fondo
hubiera dejado el texto del pase ilegible. Negro sí estaba en la paleta
enviada y da contraste garantizado sin tocar código compartido con otros
tenants. Logo circular de `/enroll`
(`apps/web/public/brand/iriz-icon.png`): el logo real del cliente es un
wordmark blanco sobre transparencia — usarlo directo en el avatar
circular (fondo claro de `/enroll`, `object-cover`) lo dejaba invisible y
recortado; el archivo real es un círculo negro con el wordmark completo
contenido sin recorte (mismo criterio de "componer un fondo sólido
detrás de un logo transparente" que ya se usó para Chilaquikes en Fase
4). Programa de sellos: placeholder mínimo (`Tarjeta de sellos`, 10
sellos, recompensa `Recompensa por definir`) creado con los mismos
defaults que ofrece el propio formulario de `/rewards` — sin esto
`/enroll/iriz-style` no podía entregar ningún pase real (sin programa,
`loadCustomerLoyaltySnapshot` devuelve `null`).

Plan: subido de `basico` a `negocio` (junto con Chilaquikes) una vez
validada la feature de promociones en producción — ver límites ajustados
más abajo.

Aislamiento RLS: verificado **estructuralmente** contra prod real (RLS
`ENABLED`+`FORCED` en las 8 tablas de tenant, política `tenant_isolation`
genérica sin ninguna excepción por negocio — Iriz queda cubierto
automáticamente, igual que Chilaquikes). No se pudo probar *en vivo* como
`app_user` (el rol `postgres` gestionado de Supabase no tiene permiso
para `SET ROLE app_user` vía `supabase db query --linked`, y otorgárselo
sería un cambio de permisos de producción fuera de alcance) — la prueba
viva real quedó cubierta después, con sesiones reales de Sergio/Narciso.

## Campos configurables de /enroll por negocio

Primer caso de un campo de `/enroll` que deja de ser fijo/compartido
entre todos los tenants — antes el formulario público era 100% idéntico
para cualquier negocio. `businesses.enroll_show_occupation` (boolean,
default `true` — preserva el comportamiento de todo negocio existente
sin tocarlos) y `businesses.enroll_show_shipping_address` (boolean,
default `false`, pedido real de Iriz: vende por WhatsApp/redes y
necesita capturar dónde enviar el pedido) — deliberadamente DOS booleans
por campo, no una tabla de configuración genérica de campos ("form
builder"): el pedido real siempre fue "mostrar/ocultar este campo
puntual para este negocio", nunca campos arbitrarios definidos por el
propio negocio.

Patrón de migración a repetir para el próximo campo configurable:
Postgres no permite `CREATE OR REPLACE FUNCTION` cuando cambia el shape
de `RETURNS TABLE` (error 42P13) — la función
`get_active_business_by_slug` (`SECURITY DEFINER`, resuelve el negocio
público de `/enroll` solo por slug) necesitó un `DROP FUNCTION` +
`CREATE FUNCTION` completo cada vez que se le agregó una columna al
`RETURNS TABLE` (`0017_enroll_business_logo.sql` para `logo_url`,
`0025_enroll_business_field_config.sql` para `enroll_show_occupation`,
y el mismo patrón otra vez para `enroll_show_shipping_address`) — hay que
repetir el `REVOKE ALL`/`GRANT EXECUTE ... TO app_user` cada vez, se
pierden al hacer `DROP`. **Este gotcha ahora vive también en el agente
`db-migrations`.**

**Gotcha real encontrado en la revisión de seguridad post-onboarding**:
el toggle es solo de UI. `enroll/[slug]/logic.ts` acepta y persiste
`shippingAddress` del `formData` incondicionalmente, sin volver a
comprobar `business.enrollShowShippingAddress` server-side — un POST
armado a mano contra un negocio con el campo desactivado (ej.
Chilaquikes, default `false`) igual lo guardaría. Es intra-tenant (el
dato lo escribe y lee el mismo negocio, nunca cruza a otro) y quedó
documentado como decisión consciente en `apps/web/tests/enroll.test.ts`
("el flag es solo UI") en vez de un descuido silencioso — pero si algún
día un campo configurable SÍ necesita enforcement real (ej. algo
sensible, no una dirección de envío opcional), hay que agregar el check
del flag en `logic.ts`, no asumir que ocultar el `<input>` alcanza.

Recordatorio operativo confirmado en esta ronda: los deploys de Vercel
SÍ corren el migrator real de Drizzle como parte del build (confirmado
al ver que las columnas/función ya existían en prod antes de que se
corriera nada manual) — para cambios de solo-datos (flags por negocio,
branding) alcanza con una migración vía código + `supabase db query
--linked` para el `UPDATE` puntual del negocio, sin necesitar la
`DATABASE_URL` directa de prod.

## Wallet de Iriz — hero, grid dinámico de sellos y el ritmo real de iteración

Iriz fue el primer uso REAL del modo `--hero` de
`packages/wallet/scripts/generate-pass-assets.ts` (Chilaquikes usa el
fallback de círculos sobre blanco, sin `--hero`, desde Fase 4) — varios
bugs reales que el modo tileado original nunca había expuesto porque
nadie lo había usado en serio:

1. **Costura horizontal Y vertical (mosaico)**: el modo tileado
   original sampleaba un parche cuadrado de 300px y lo repetía para
   llenar el strip — con un hero que es una foto de marca ya terminada
   (no una textura pura diseñada para repetirse), esto se veía como un
   mosaico de 3-4 copias en un dispositivo real en vez de una imagen
   continua. La discrepancia real que delató el problema: Google Wallet
   (que muestra el `heroImage` completo, sin tilear) se veía correcto,
   Apple no — la señal de que el problema era el MODO, no el asset.
   Fix: `--hero-cover` nuevo (cover-crop del hero completo al tamaño
   exacto del canvas, sharp `fit:"cover"`, sin parche ni tile) + el
   `--logo` separado se compone encima SIEMPRE salvo `--no-strip-logo`
   (para un hero que, como el de Iriz, ya trae su propio wordmark —
   componer el logo de nuevo se hubiera visto duplicado/desalineado).
2. **Grid de 2 filas pegado al borde inferior**: al pasar de 1 fila a un
   grid dinámico de 2 filas (`computeIrizStampGrid`, ver abajo), el
   cálculo de diámetro llenaba EXACTAMENTE la banda reservada sin
   margen — la fila de abajo tocaba literalmente el borde del strip.
   Fix: margen vertical explícito restado del alto disponible ANTES de
   calcular el diámetro.
3. **Banda heredada del layout de 1 fila sin motivo real**: el grid
   seguía constriñéndose a una banda de 50pt (la mitad del strip) —
   valor heredado de cuando el logo SÍ se componía arriba y había que
   dejarle espacio. Con `--no-strip-logo` (el caso real de Iriz, sin
   logo que evitar) esa restricción ya no aplicaba, pero nadie la había
   quitado — los sellos salían a ~21pt de diámetro, encogidos sin
   necesidad. Fix: `computeIrizStampGrid` recibe `reservedTopPt` (0 sin
   logo compuesto, el footprint real del logo —
   `HERO_LOGO_TOP_PT + HERO_LOGO_HEIGHT_RATIO*STRIP_BASE_HEIGHT` —
   cuando sí se compone) y usa TODO el alto que sobra, no una banda fija.
4. **Sobrecorrección**: sin ningún tope, el fix anterior maximizaba el
   diámetro hasta ocupar ~82% del alto del strip, dejando el patrón de
   fondo reducido a un borde mínimo. Fix final:
   `STAMP_BLOCK_HEIGHT_RATIO` (0.48 — el bloque de 2 filas ocupa un
   ~48% explícito del área asignada, no "lo más grande que quepa") +
   `STAMP_ROW_GAP_RATIO` (0.5, deliberadamente mayor que
   `STAMP_GAP_RATIO`/0.32 horizontal — con el diámetro más chico que
   exige el ratio de arriba, una separación proporcionalmente mayor
   evita que las dos filas se vean pegadas).

`computeIrizStampGrid` (función nueva, **exclusiva** del modo `--hero` —
`computeStampLayout`/`buildStripSvg`, lo único que usa Chilaquikes,
quedaron byte-a-byte idénticos en cada una de estas rondas, confirmado
con diff de la función completa cada vez, no solo revisión visual) es
genérica por si Iriz cambia su `stampsRequired`: `n<=5` → 1 fila
centrada; `n>=6` par → 2 filas iguales en grid regular sin intercalar;
`n>=6` impar → 2 filas desiguales con la de abajo intercalada en el
punto medio horizontal entre cada par de círculos de arriba (patrón
panal).

Colores de los sellos, también parametrizados (`--empty-stamp-stroke`,
`--stamp-backing-fill`, `--stamp-filled-fill`, todos aislados a
`buildHeroStripAt3x`, nunca al fallback de Chilaquikes): la versión real
que se subió a producción de Iriz es fondo blanco / sello lleno negro /
contorno negro en sellos vacíos (antes gris). Una variante invertida
(fondo negro, sello lleno blanco, contorno blanco) se probó y quedó
viviendo SOLO en el tenant sandbox `wallet-verify-test` (branding
clonado de Iriz + una sucursal de prueba propia) para seguir iterando
sin arriesgar el tenant real de un cliente pagando.

**Regla permanente de validación establecida en esta ronda** (pedido
explícito tras que rondas anteriores del mismo fix "reportaran éxito"
sin que el cambio se reflejara realmente): ningún ajuste de
`generate-pass-assets.ts` se reporta como resuelto sin armar un
`.pkpass` REAL (`buildPassJson`+`buildPkpass`+firma fake, mismo código
de producción salvo la firma — ejecutado vía un test de Vitest
descartable, ya que `node --experimental-strip-types` directo no
resuelve los imports sin extensión de `packages/wallet/src/`),
descomprimirlo, y verificar el `strip@3x.png` empaquetado DESDE ADENTRO
del `.pkpass` — con un hash `sha256` contra el archivo fuente para
confirmar que no hay staleness en el pipeline. Revisar el PNG que el
generador escribe directo en `apps/web/public/passes/` no es suficiente
por sí solo: no prueba que el pipeline de empaquetado real lo esté
leyendo. **Esta regla y el resto del procedimiento de generación de
assets viven ahora en la skill `wallet-integration`.**

## Google Wallet — logo de Iriz invisible en la lista de "Pases", classId `_v9`

Bug real reportado desde un dispositivo real (no visible en ningún
render/preview): en la vista de "Pases" de Google Wallet (el listado,
no el detalle expandido) el logo de Iriz se veía como un círculo blanco
vacío. Causa: `programLogo` apuntaba al mismo wordmark blanco sobre
transparencia que sí funciona en el header de Apple (fondo negro
sólido) — pero la vista de lista de Google renderiza ese círculo sobre
chrome CLARO, mismo bug de fondo que ya se había corregido para el
avatar circular de `/enroll` (ver alta de Iriz arriba), nunca portado a
Google hasta este hallazgo.

Confirmado con un `GET` real a la Loyalty Class `_v8` ya creada en
producción (un dispositivo real ya la había guardado antes del fix):
`programLogo` seguía apuntando al asset roto pese a que
`businesses.google_logo_uri` ya se había corregido en la DB — **Google
nunca relee una clase ya creada/cacheada a partir de un save-link
nuevo**, confirma en la práctica la regla ya documentada ("nunca un
PATCH in-place, siempre classId nuevo"). Fix: `programLogo` pasa al
mismo círculo negro con wordmark contenido que ya usa `/enroll`
(`apps/web/public/brand/iriz-icon.png`) + bump a `_v9`
(`CURRENT_GOOGLE_LOYALTY_CLASS_VERSION`). Sin migración de clientes
reales esta vez: Chilaquikes no tiene ningún campo que cambie (se queda
en `_v8` sin verse afectado, no hay razón para migrarlo) e Iriz no tenía
ningún cliente real con pase de Google ya guardado (el único de prueba
se había dado de baja antes). El classId `_v9` real de Iriz se creó y
verificó explícitamente contra la API (`upsertLoyaltyClass` + `GET`)
antes de dar el fix por bueno, mismo criterio de verificación real que
el resto de esta sección.

`_v8` (el bump anterior, mismo período): `cardRowTemplateInfos` pasa de
`oneItem` (solo `accountName`) a `twoItems` (`accountName` +
`object.loyaltyPoints.balance`) — pedido explícito para que el conteo de
sellos sea visible en la cara de la tarjeta sin tocarla, aplica a todo
negocio con Google Wallet activo. Confirmado el shape `twoItems` contra
la API real (`startItem`/`endItem`, no un array de más campos) con una
clase de verificación antes de aplicarlo.

## Bugs de UI corregidos — input de fecha comprimido y traslape en ficha de cliente

Dos bugs de responsive reportados sobre la primera impresión de Iriz
como segundo cliente real:

1. **`/enroll`, campo Fecha de nacimiento comprimido**: el box model
   (`height`/`padding`/`font-size`) del `<input type="date">` ya era
   idéntico al resto de los campos (confirmado con
   `getBoundingClientRect`, no solo mirando la captura) — Safari/iOS y
   Chrome Android renderizan los segmentos día/mes/año dentro de un
   shadow DOM con su propio padding fijo, independiente del padding del
   `<input>` mismo. Fix: normaliza los pseudo-elementos
   `::-webkit-datetime-edit*` en `globals.css`. Limitación real: no hay
   forma de renderizar el shadow DOM nativo de WebKit desde
   Chromium/Playwright en este entorno — Playwright puede verificar el
   box model del `<input>`, nunca el resultado final en Safari real.
2. **`/customers/[id]`, email largo traslapado sobre Cumpleaños**: un
   grid item de CSS Grid sin `min-w-0` nunca se encoge por debajo del
   ancho intrínseco de su contenido — un email largo (una sola "palabra"
   sin espacios) empujaba la columna de al lado en vez de hacer wrap.
   Fix: `min-w-0` en cada celda del grid + `break-words` en cada `dd`.
   Reproducido y confirmado con Playwright (caso real reportado,
   `zamoragamboamelissajuli@gmail.com`) antes y después del fix.

## Promociones — límites ajustados al subir Chilaquikes e Iriz a plan negocio

`MONTHLY_LIMIT_BY_PLAN` (`apps/web/app/(product)/promotions/constants.ts`):
`negocio` 5→4, `intelligence` 10→8 — pedido explícito al subir
Chilaquikes e Iriz Style de `basico` (donde se probó la feature) a
`negocio`, ahora que el broadcast de promociones ya está validado en
producción real. Solo el número cambió — el gate de plan y el
`SELECT ... FOR UPDATE` que serializa el conteo bajo concurrencia
(`promotions/logic.ts`) no se tocaron.

## Panel de administración de plataforma — roles, impersonación y endurecimiento

Cinco PRs seguidos (#81–#85) que reemplazan por completo el alta mínima
de `/admin` de Fase 1 (solo `businessName`/`ownerEmail`, ver arriba) por
un panel real de operación de plataforma, con impersonación de negocio y
gestión de cuentas. Es la UI para el dueño de la plataforma, no para el
dueño de un negocio-tenant — no confundir con el `/dashboard` del dueño
de un negocio, que sigue siendo el de siempre. **El modelo vigente
(roles, impersonación, allowlist de `createAdminClient`) está resumido en
`claude.md`; aquí queda el detalle completo, PR por PR.**

**Modelo de roles** (`packages/db/migrations/0028_peaceful_juggernaut.sql`):
`platform_admins.is_platform_admin` (boolean) se conserva tal cual para no
romper el claim JWT ya documentado en Fase 1, pero deja de ser la única
señal — nueva columna `platform_admins.platform_role`
(`platformRoleEnum`, `owner`/`viewer`, default `owner`). El hook de auth
(`0029_platform_admin_impersonation_hook.sql`, diff mínimo sobre el
original de `0010_supabase_auth_bridge.sql`, mismo criterio de "extender,
no reescribir" que ya se siguió para el geofence y otras rondas) agrega
tres claims nuevos al JWT: `platform_role`, `impersonating_business_id` e
`impersonating_platform_role` — los dos últimos solo se llenan si hay un
`platform_impersonation_grants` activo para ese admin.

**Impersonación real** (`apps/web/app/admin/impersonation.ts`): un admin
`owner` que impersona un negocio obtiene acceso de ESCRITURA completo, no
solo lectura — vía una fila de `users` provisionada (o reactivada si ya
existía de una impersonación anterior del mismo negocio) con email
sintético estable `platform-admin+{adminAuthUserId}@pragmia-internal.invalid`
(dominio `.invalid`, RFC 2606 — nunca resuelve, nunca recibe correo real).
Esa fila es el mismo actor real que usan `resolveActor`/`writeAuditLog`
para las FK `created_by`/`updated_by` de cualquier escritura hecha durante
la impersonación — no hay un actor "fantasma" fuera del modelo de
auditoría ya existente. `platform_impersonation_grants` tiene un índice
único parcial (`0031_naive_sharon_ventura.sql`,
`WHERE ended_at IS NULL`) que garantiza como invariante de DB, no solo de
aplicación, que un admin nunca tiene más de un grant activo a la vez. TTL
de seguridad de 24h en el grant (`GRANT_SAFETY_NET_HOURS`) — es un "dead
man's switch" si el admin cierra la laptop sin salir explícitamente, NO
el mecanismo real de terminación (eso es `endImpersonation()`, la acción
explícita de "Salir").

`audit_logs.business_id` pasó a nullable
(`0030_special_clint_barton.sql`) para poder auditar acciones de gestión
de CUENTAS de plataforma (invitar/desactivar/cambiar rol de un
`platform_admin`) que no tienen ningún negocio al que asociarse — RLS
sigue intacta porque `business_id NULL` nunca calza contra
`current_setting('app.current_business_id')`, esas filas siguen siendo
estructuralmente invisibles para cualquier sesión de tenant.

**Fix crítico incluido desde el PR original (#81)**: desactivar la cuenta
de un admin no terminaba su impersonación activa — la fila de `users`
provisionada seguía viva y el siguiente login del admin ya desactivado
recuperaba acceso completo e indefinido al negocio que impersonaba.
`setPlatformAdminActive` ahora termina el grant y desactiva esa fila en
la MISMA transacción que la desactivación del admin.

**Bug real en prod, JWT stale tras impersonar (#82)**: `startImpersonation()`/
`endImpersonation()` solo escribían la DB — el access token que el admin
ya tenía en el navegador seguía firmado con los claims viejos (el hook
solo corre en login/refresh, nunca en cada request), así que "Entrar como
dueño" redirigía a `/dashboard` con un JWT que todavía decía
`kind: "platform_admin"` sin `business_id`, y `(product)/layout.tsx`
rebotaba de vuelta a `/admin`. Reportado en producción al impersonar
tanto Chilaquikes como Iriz Style. Fix: ambas acciones fuerzan un
`refreshSession()` (mismo `refresh_token` ya en cookies, sin login nuevo)
antes de redirigir.

**Sistema de diseño propio de `/admin` (#83)**: `/admin` nunca había
tenido el sistema de diseño compartido del resto del producto — quedó
como HTML/divs sueltos desde el alta mínima de Fase 1. `AdminShell.tsx` +
`AdminUserMenu.tsx` + `app/admin/layout.tsx` replican el mismo patrón que
`components/AppShell.tsx` (sidebar fija + drawer móvil), con `NAV_ITEMS`
como único lugar para agregar una sección de plataforma futura;
`PageHeader`/`EmptyState`/`Table`/`useActionToast` reemplazan los divs y
`<Alert>` inline de antes, mismo criterio que ya rige el resto de
`apps/web/app/(product)/` (ver skill `frontend-conventions`). Bug de
contraste corregido en el mismo PR: el botón "Salir" del banner de
impersonación heredaba texto blanco casi invisible sobre
`bg-background` — ahora fija su propio color/borde/hover.

**Redefinición del rol `viewer` (#84)**: pedido explícito para el socio
del negocio. Antes un `viewer` era de solo lectura incluso DENTRO de un
negocio impersonado (sin fila de `users` provisionada — `resolveActor`/
`requireOperationContext` lo rechazaban explícitamente). Ahora: dentro de
`/admin`, un `viewer` solo ve la pestaña "Negocios" (nav filtrado en
`AdminShell` + bloqueo real server-side en `/admin/accounts`, no solo el
link oculto); puede cambiar el estado de un negocio (activar/suspender/
marcar `unpaid`, ya sin `requireOwner()`) y ver — no editar — sucursales y
branding (`BrandingReadOnly.tsx` nuevo). Eliminar negocio, editar
sucursales/branding, crear negocios y gestionar cuentas de plataforma
siguen exclusivos de `owner`. Al impersonar, ambos roles obtienen ahora
el mismo acceso de escritura completo (se quitó el guard que antes
bloqueaba a un `viewer` impersonando).

**Endurecimiento tras revisión ofensiva (#85)** — pedido explícito:
revisión con mentalidad de atacante sobre todo lo agregado en la ronda.
Hallazgos reales, de mayor a menor severidad:
- **CRÍTICO**: sin rate limiting en NINGUNA acción de `/admin` —
  cualquier credencial de plataforma (owner o viewer, ya que viewer
  impersona con acceso completo desde #84) podía recorrer
  `listBusinesses()` y llamar `startImpersonationAction` en loop para
  tomar control de escritura de TODOS los negocios en segundos, sin que
  nada lo detectara (`impersonation.started` era auditoría write-only,
  ninguna vista la mostraba). Fix: rate limit por admin (10/5min, mismo
  patrón que scanner/enroll, ver `lib/rateLimit.ts`) + `RecentActivity.tsx`,
  vista real de "Actividad reciente de plataforma" en `/admin` que por
  fin lee `audit_logs`.
- **ALTO**: `/set-password` llamaba `setSession()` sobre el cliente de
  navegador normal (cookies reales) apenas cargaba la página, ANTES de
  que la persona escribiera ninguna contraseña — quien abriera el link
  (buzón comprometido, un escáner de enlaces corporativo, una regla de
  reenvío maliciosa) ya tenía sesión completa con solo abrirlo. Fix: la
  verificación del token y el cambio de contraseña corren sobre un
  cliente en memoria (`persistSession: false`) que nunca toca cookies;
  la sesión real solo se persiste DESPUÉS de que `updateUser({password})`
  confirma éxito.
- **ALTO**: invitar como admin de plataforma el email de alguien que ya
  es dueño/staff de un negocio le quitaba silenciosamente su acceso
  normal de tenant en su próximo login (mismo bug ya corregido a mano
  para `iancarlo1203@gmail.com` en esta misma ronda). Fix: guard
  explícito tanto en `invitePlatformAdmin()` como en el script
  `apps/web/scripts/invite-platform-accounts.ts`, antes de invitar.
- **MEDIO**: el soft-delete de un negocio (estado `deleted`, ver arriba)
  era cosmético — ninguna acción real (impersonar, cambiar estado,
  editar sucursales/branding) comprobaba el status antes de operar. Fix:
  `assertBusinessNotDeleted()` en cada punto de escritura +
  `getBusinessDetail` ahora trata un negocio eliminado como inexistente.

Verificado en vivo con Playwright en cada PR (impersonación completa,
shell desktop/móvil, rate limiting sin bloquear uso legítimo, actividad
reciente mostrando el evento real). `tenant-security-reviewer` corrió
sobre #84 (limpio salvo comentarios desactualizados, corregidos) y la
ronda ofensiva de #85 fue una revisión dedicada, no la rutinaria. Suite
completa: 170/170 al cierre de #85.

**`/team` gana alta real de staff** (antes solo tenía desactivación, ver
"Endurecimiento de seguridad" arriba): `CreateStaffForm.tsx` +
`team/logic.ts` extendido — mismo patrón de `createAdminClient()`
confinado que ya usaba `employeeOffboarding.ts` (Auth Admin API para
crear el `auth.users`, no `adminDb`/Postgres).

**Actualiza la lista de excepción de `createAdminClient()`** (ver
"Endurecimiento de seguridad — rate limiting, offboarding, búsqueda
exacta" arriba, que documentó la primera excepción): el test estático
permanente en `apps/web/tests/prod-readiness.test.ts`
(`ALLOWED_CREATE_ADMIN_CLIENT_IMPORTERS`) ahora incluye también
`app/admin/actions.ts`, `app/admin/accounts.ts`, `app/admin/activity.ts`
(gestión de cuentas de plataforma) y `app/(product)/team/logic.ts` (alta
de staff, este párrafo) — sigue siendo una lista cerrada que falla el
test ante cualquier uso nuevo no autorizado, no un comentario que se
pueda ignorar.

## Observabilidad — captura de errores en producción con Sentry (no numerada)

Pedido explícito: "hoy no tengo forma de enterarme de un error de
producción salvo que un cliente me escriba" — con Chilaquikes e Iriz
Style ya en vivo y cobrando, se volvió inaceptable. Prioriza las 4
rutas donde un fallo silencioso ya costó tiempo de diagnóstico: push
APNs (Apple Wallet), PATCH de Loyalty Object (Google Wallet),
`scanner/logic.ts` (sellar/canjear), y `/enroll` (único endpoint
público sin sesión).

**Diagnóstico previo** (paso 0, reportado antes de instalar nada): cero
observabilidad configurada a medias — sin variables huérfanas en
`.env.example`, sin ninguna mención de Sentry/Datadog/etc. en el repo.
`resolveWalletConfig()` (`packages/wallet/src/config.ts`) ya logueaba
bien la decisión de arranque (REAL vs FAKE por proveedor), pero eso es
"qué credenciales cargó el proceso", no "qué falló en un push/PATCH
real" — ese caso, en `apps/web/lib/wallet/notify.ts`, terminaba siempre
en `console.error(...)` y se perdía ahí (Vercel no agrega ni alerta
sobre logs sueltos). Hallazgo útil: el código YA distinguía error
esperado de error real antes de esta ronda — `scanner/logic.ts` tiene
`OperationRejectedError`/`ReplayDetectedError` capturadas aparte con
`instanceof` antes de caer a un `catch` genérico con `console.error`;
mismo patrón en `enroll/[slug]/logic.ts` con `EnrollDuplicatePhoneError`/
`EnrollBusinessNotFoundError`. Instrumentar fue enganchar Sentry
exactamente en esos catches genéricos ya aislados, sin tocar ninguna
línea de lógica de negocio. Hallazgo adicional no pedido explícitamente
pero del mismo endpoint: la generación del pase de Wallet post-alta en
`/enroll` (`buildWalletArtifactsForNewEnrollment`) tenía su propio catch
igual de silencioso — un cliente se registraba bien pero nunca recibía
su pase, invisible hasta ahora.

**Proveedor**: Sentry, sin objeción — el motivo concreto es que los 4
puntos de fallo ya estaban aislados en el código (clases de error
distintas, catches ya separados), así que instrumentar es agregar una
llamada de captura dentro de catches existentes, sin tocar lógica de
negocio. `@sentry/nextjs` 10.70.0 declara soporte explícito para Next 16
(`peerDependencies: next: "^16.0.0-0"`, la versión de este proyecto).

**Instalación**: `pnpm add @sentry/nextjs` en `apps/web` disparó
`[ERR_PNPM_IGNORED_BUILDS]` — el postinstall de `@sentry/cli` (descarga
el binario de la CLI, usado solo para subir source maps) quedó bloqueado
por la política de supply-chain del proyecto (`pnpm-workspace.yaml`,
`allowBuilds` — ya tenía entradas para esbuild/sharp/unrs-resolver de
antes). `pnpm approve-builds --all` lo aprobó explícitamente (queda en
git, reviewable) y corrió el postinstall real.

**Arquitectura — server-only, sin SDK de cliente todavía**: `apps/web/
instrumentation.ts` (hook de Next.js, `register()`) solo carga
`sentry.server.config.ts` en runtime `"nodejs"` — nunca edge (esta
plataforma es Node-first a propósito, ver Arquitectura en `claude.md`) y
sin `sentry.edge.config.ts` porque ninguna de las 4 rutas objetivo corre
ahí. Paso 2 (cliente/dashboard/scanner PWA) quedó deliberadamente fuera
de esta ronda, tal como se pidió — "si agrega complejidad
desproporcionada, déjalo para una iteración aparte".

`captureServerError()` (`apps/web/lib/observability/captureServerError.ts`)
es el ÚNICO punto sancionado para reportar una excepción — mismo
espíritu que otros puntos sancionados del proyecto. Su `extra` está
tipado para aceptar SOLO primitivos (`string | number | boolean | null`),
nunca un objeto — es IMPOSIBLE, a nivel de compilador, pasar por error un
`customer`/`formData`/sesión completos; cada call site elige a mano qué
campos individuales pasar. `operation` es un union type cerrado (7
valores: `wallet.notify.apple`, `wallet.notify.google`,
`wallet.notify.query`, `scanner.lookup`, `scanner.stamp`,
`scanner.redeem`, `enroll.customer`, `enroll.wallet_artifacts`), no un
string libre — agrupa los eventos en Sentry de forma consistente.

**Filtro de PII/secretos — dos líneas, nunca una sola**:
1. La disciplina de tipos de `captureServerError()` arriba (primera
   línea, en tiempo de compilación).
2. `beforeSend`/`beforeBreadcrumb` en `sentry.server.config.ts`
   (`lib/observability/scrub.ts`, segunda línea, en runtime): redacta
   por KEY sensible (denylist con `token`/`password`/`secret`/
   `authorization`/`cookie`/`phone`/`email`/`fullname`/`dateofbirth`/
   `occupation`/`shippingaddress`/etc., recursivo hasta 6 niveles) Y por
   patrón de TEXTO LIBRE (regex de email + corridas de 10+ dígitos) —
   esto último cubre un caso real no obvio: Postgres a veces embebe el
   valor real de una columna en el `detail` de un error de constraint
   único (`Key (phone)=(5551234567) already exists`), que no vive bajo
   ninguna key sospechosa, es parte del mensaje de la excepción misma.
   Se redacta solo el fragmento que matchea, no el evento completo — la
   parte útil para diagnosticar ("qué constraint violó") sobrevive.

También: `sendDefaultPii: false` explícito, `tracesSampleRate: 0` (solo
error tracking en esta ronda, no performance monitoring — menos datos
saliendo hacia el proveedor sin necesidad real), y la integración
`Console` desactivada (los call sites ya hacen `console.error()` +
`captureServerError()` por separado — sin esto, el mismo error quedaría
duplicado como breadcrumb automático con argumentos crudos sin pasar por
el scrub).

**Severidad — crítico vs revisión periódica**: tag `severity` en cada
evento, dos valores:
- `"critical"` (alerta inmediata): `scanner.stamp`/`scanner.redeem`
  (excepción no controlada en el camino de escritura más sensible de la
  plataforma) y `enroll.customer` (único endpoint público sin sesión —
  una excepción ahí puede significar que NINGÚN cliente nuevo se puede
  registrar, o un patrón de abuso que el rate limit/honeypot no
  atajaron).
- `"warning"` (revisión periódica, no alerta por evento individual):
  `wallet.notify.apple`/`wallet.notify.google` (un dispositivo o un PATCH
  aislado fallando es churn normal de una API externa — self-healing en
  el siguiente sello), `scanner.lookup` (bloquea a un empleado de operar
  pero no corrompe ningún sello/canje), y `enroll.wallet_artifacts` (el
  alta del cliente YA confirmó, best-effort, staff puede entregar el pase
  después). Si cualquiera de estos "warning" empieza a ocurrir en
  volumen (ej. certificado de Apple vencido → TODOS los pases fallan, no
  solo uno), la regla de alerta por frecuencia en Sentry escala sola —
  no hace falta la severidad "critical" para detectar un patrón
  sistémico, solo para el primer evento aislado.

Nunca se envía a Sentry el caso "esperado" (`OperationRejectedError`,
`ReplayDetectedError`, `EnrollDuplicatePhoneError`,
`EnrollBusinessNotFoundError`, rate limit) — la instrumentación vive
EXCLUSIVAMENTE en los catches genéricos que ya distinguían "error real"
antes de esta ronda. Es más estricto que "enviar pero no alertar": cero
volumen de eventos por un 403 controlado, no solo cero ruido de alerta.

**`onRequestError` deliberadamente NO configurado**: el hook automático
de Next.js/Sentry captura el request completo de CUALQUIER ruta que
truene, incluidas rutas con PII en el body nunca auditadas para este
filtro (alta manual de cliente en `/customers`, etc.). `next build`
advierte por esto ("outdated configuration") — advertencia esperada de
la decisión, documentada en el propio `instrumentation.ts` para que
nadie la "arregle" sin auditar primero todas las rutas que tocaría.

**Alertas — canal y reglas** (acción manual pendiente en el dashboard de
Sentry, fuera del alcance de lo que se puede automatizar desde el
repo): dos direcciones de correo confirmadas,
`iancarlo1203@gmail.com` y `admin@pragmia-data.com`, un solo proyecto de
Sentry. Reglas recomendadas:
1. Alerta inmediata por email a ambas direcciones cuando
   `tags[severity] equals critical` — sin umbral, dispara en la primera
   ocurrencia.
2. Alerta por volumen (no inmediata) cuando `tags[severity] equals
   warning` Y el mismo issue ocurre ≥5 veces en 30 minutos — agarra el
   caso "certificado vencido"/"bug sistémico de firma" sin generar ruido
   por un dispositivo aislado. El resto de los eventos "warning" queda
   visible en el Issues dashboard para revisión periódica (Sentry además
   manda un resumen semanal a los miembros del proyecto por default, sin
   configuración adicional).

**Verificación end-to-end** (paso 4 — "no des esto por hecho solo porque
el SDK está instalado"): dos capas, no una.
1. `apps/web/tests/observability-scrub.test.ts` — prueba pura del filtro
   aislado (redacción por key, redacción de texto libre embebido tipo
   `detail` de Postgres, recursión profunda sin reventar).
2. `apps/web/tests/observability-verification.test.ts` — prueba REAL end-
   to-end: siembra un cliente con PII reconocible (nombre/teléfono/email
   únicos por corrida) y un dispositivo con un push token secreto
   también único, provoca una excepción REAL en cada una de las 4 rutas
   A TRAVÉS DEL CÓDIGO DE PRODUCCIÓN real (`registerStampForSession`/
   `redeemRewardForSession`/`enrollCustomerForSlug`/
   `notifyWalletOfTransaction`) — solo se sustituye UNA dependencia de
   bajo nivel por caso (`evaluateStamp`/`evaluateRedemption` de
   `@loyalty/core`, `enrollCustomerPublic`/
   `buildWalletArtifactsForNewEnrollment`, el sender de APNs o el cliente
   de Google) vía `vi.spyOn`/`vi.mock`, nunca lógica de negocio. Confirma
   por caso: el tag `operation`/`severity` correcto, `business_id`
   presente, y que NINGÚN fragmento de la PII/secreto sembrado aparece en
   ningún argumento capturado por Sentry — la prueba real de que el
   filtro actúa sobre datos genuinos, no solo sobre el fixture aislado
   del punto 1. Nota técnica: `vi.spyOn` directo sobre
   `@sentry/nextjs.captureException` revienta ("Cannot redefine
   property", namespace ESM no configurable) — el patrón que funciona es
   `vi.mock("@sentry/nextjs", async (importOriginal) => ...)` reemplazando
   solo ese export.

Suite completa corrida tras la ronda: 179/179 (170 previos + 9 nuevos:
3 del filtro aislado, 6 de la verificación end-to-end). `next build`
limpio (marketing sigue ○ Static), `next lint` limpio, typecheck limpio
en las 6 workspace projects.

Pendiente, genuinamente fuera de lo que se puede hacer desde el repo:
configurar las 2 reglas de alerta en el dashboard de Sentry (ver arriba)
y setear `SENTRY_DSN` real en `apps/web/.env.local`/Vercel — sin eso,
`Sentry.init()` queda sin DSN y el SDK es un no-op silencioso (no
revienta el arranque, pero tampoco manda nada). Genuinamente pendiente
también: Paso 2 (cliente/dashboard/scanner PWA), deliberadamente fuera
de esta ronda.

**Revisión `tenant-security-reviewer` — un hallazgo CRÍTICO real, no
teórico**: `DrizzleQueryError` (drizzle-orm) construye su `.message`
como `` `Failed query: ${query}\nparams: ${params}` `` — el ARRAY REAL de
parámetros bindeados de la query, coaccionado a string. En
`enroll_customer_public` (`packages/db/src/enroll.ts`) esos parámetros
son literalmente nombre/teléfono/email/fecha de nacimiento/ocupación/
dirección/`wallet_token`; cualquier fallo de esa query que no fuera uno
de los dos casos ya tipados (teléfono duplicado, negocio inexistente)
relanzaba ese error tal cual — y de ahí llegaba a `captureServerError()`
sin pasar por NINGÚN saneo: ni el tipado de `extra` (que nunca toca el
objeto `error` mismo, solo el contexto adicional), ni el scrub de
`sentry.server.config.ts` (que solo mira email/corridas de 10+ dígitos
en texto libre — un nombre, una fecha `YYYY-MM-DD`, o un `wallet_token`
alfanumérico no matchean ninguno de los dos patrones). Mismo vector,
superficie más angosta, en `lookupCustomerByTokenForSession`
(`scanner/logic.ts`) usando el `wallet_token` del QR como parámetro de
la query. Hallazgo MEDIO relacionado: `packages/wallet/src/google/
signer.ts` incluía el body crudo de la respuesta de error de la Wallet
API en el `Error` lanzado — Google a veces hace eco del valor inválido
recibido (ej. `"Invalid value at 'object.accountName' ... 'Juan
Pérez'"`), y el payload real sí incluye `customerFirstName`.

El revisor también marcó, correctamente, que
`observability-verification.test.ts` NO cubría este hueco — sus 4 casos
provocan el fallo sustituyendo la dependencia por un `Error` de control
inventado por el propio test (`new Error("boom-...")`), nunca ejercitan
la función real de drizzle-orm contra un fallo real de Postgres — el bug
real sobrevivía sin que la prueba lo notara.

**Fix, centralizado en vez de parcheado en cada call site**:
`captureServerError()` (`apps/web/lib/observability/captureServerError.ts`)
ahora detecta la FORMA de un `DrizzleQueryError` (tiene `.query`/
`.params` propios — señal precisa, no parsear el mensaje con regex) y lo
reconstruye con un mensaje limpio (solo el código SQLSTATE de Postgres si
existe, ej. `23505`, nunca los valores) ANTES de pasarlo a
`Sentry.captureException`. Deliberadamente centralizado en el único
punto sancionado en vez de parchear `enroll.ts`/`scanner/logic.ts` por
separado: cubre estos 2 casos encontrados Y cualquier call site futuro de
`captureServerError()` que alguna vez deje pasar un error de DB sin
envolver, sin depender de que cada desarrollador lo recuerde. `signer.ts`
gana `logAndThrowApiError()`: el body completo de la respuesta de Google
se sigue logueando (`console.error`, primer-party — Vercel, no un
proveedor externo) para diagnóstico local, pero el `Error` que
efectivamente propaga (y que sí puede llegar a Sentry) solo lleva el
status HTTP y qué operación/recurso falló.

Test nuevo dirigido (`apps/web/tests/observability-capture-sanitize.test.ts`):
construye un `DrizzleQueryError` REAL (import directo de `drizzle-orm`,
no un mock a mano) con parámetros que parecen PII/`wallet_token`, confirma
primero que la premisa del hallazgo es cierta (el error real SIN sanear
efectivamente contiene esos valores — para que la prueba falle ahí, no
más abajo, si una versión futura de drizzle-orm cambia el formato) y
después que `captureServerError()` los elimina antes de que lleguen a
Sentry, preservando el código SQLSTATE como único dato útil. Suite
completa tras el fix: 181/181 (179 + 2 del test dirigido). Segunda
pasada de `tenant-security-reviewer` no se pidió explícitamente para este
fix puntual — el razonamiento del fix (detectar por forma, no por regex
de mensaje; centralizar en un solo punto) es la misma disciplina que ya
pidió la primera pasada.

## Auditoría de rendimiento — "la plataforma se siente más lenta" (no numerada)

Pedido explícito tras varias rondas de cambios recientes (observabilidad,
panel de admin): auditar TODAS las causas posibles de lentitud percibida,
y probarlo en vivo contra la plataforma real, no solo leer código.

**Diagnóstico en vivo, con datos reales**: impersonando CHILAQUIKES real
(admin de plataforma) y midiendo con cronómetro real (no solo status
code), navegar entre pestañas del dashboard mostró un patrón claro en
`_middleware` y en `/rewards`/`/customers`/`/dashboard`/`/scanner`: la
MEDIANA es rápida (25-170ms), pero una minoría de requests cae en 1-3
segundos — firma clásica de cold start ocasional en Vercel, no lentitud
pareja. Confirmado con un export real de logs de Vercel (`durationMs` por
función, no solo status code — un cold start que excede el timeout del
borde nunca llega a loguearse como función ejecutada, así que buscar por
"503" no encuentra nada aunque el problema sea real). Con Fluid Compute
ya activo en la cuenta, el patrón persiste — no se aisló con certeza si
Sentry (el cambio más reciente y pesado) lo agrava, un intento de
comparación A/B con un deployment viejo de Vercel chocó con la protección
SSO automática que Vercel pone a cualquier deployment que ya no es el
actual — no se intentó rodear, es una protección de seguridad legítima.

**Hallazgo real y medido, no cold start**: `/customers/{id}/wallet/apple`
(entrega del pase de Apple) fue la única ruta consistentemente lenta —
2.7 a 3.3 segundos, las 3 veces que se registró en la hora de logs
exportada, sin ninguna muestra rápida. Investigado a fondo, dos causas
reales en `generateApplePkpassForCustomer`
(`apps/web/lib/wallet/passGeneration.ts`):

1. **El culpable principal**: cada `.pkpass` generado disparaba hasta 9
   fetches HTTPS de vuelta al propio dominio (`resolveBusinessAssetBuffer`,
   logo/strip/icon × 1x/2x/3x) — archivos de branding estático que ya
   viven en el mismo deploy, pero se leen así a propósito desde Fase 4
   (`@vercel/nft` no traza de forma confiable una lectura directa de
   filesystem entre bundles de función distintos). Nadie cacheó el
   resultado. **Fix**: cache en memoria por proceso en
   `resolveBusinessAssetBuffer` (TTL 10min — branding estático que solo
   cambia al re-correr `generate-pass-assets.ts`, acción manual rara;
   nunca cachea un fallo). Probado: segunda llamada a la misma URL no
   refetchea, URLs distintas se cachean por separado, un 404 nunca queda
   pegado.
2. **Secundario**: `createRealPkpassSigner`
   (`packages/wallet/src/apple/signer.ts`) re-parseaba el certificado y
   la llave privada de PEM en CADA firma, aunque `getPkpassSigner()`
   (`apps/web/lib/wallet/adapters.ts`) ya memoiza el signer una vez por
   proceso — el parseo estaba mal ubicado, dentro del closure que sí
   corre por request en vez de afuera. Movido fuera; el throw por
   credenciales inválidas ahora ocurre al construir el signer (falla más
   rápido, en la resolución de config) en vez de al firmar — mismo
   comportamiento observable para los 4 callers reales, todos ya
   envueltos en try/catch.

Ambos, mergeados juntos (PR #90): cero cambio de comportamiento, mismo
`.pkpass`, mismos bytes firmados, solo menos trabajo repetido. Suite
completa: 186/186.

**Tercer hallazgo, arreglado por separado** (pedido explícito: cada fix
en su propio commit/PR): las 4 rutas reales que generan un `.pkpass`
(`downloadApplePassForSession`, el web service público `getLatestPass`,
y las dos de `publicEnrollWallet.ts`) corrían la FASE 2 completa (los 9
fetches ya cacheados + la firma PKCS#7, ~2-3s reales) DENTRO de la misma
transacción de Postgres que solo necesitaban para 2 queries — dejaba una
conexión del pool de la conexión ocupada todo ese tiempo por trabajo que
no la necesitaba, agravando exactamente el tipo de agotamiento de pool
ya documentado como incidente real (`PG_POOL_MAX`, ver `vitest.config.ts`).
Fix: `generateApplePkpassForCustomer` se partió en
`loadApplePassGenerationInputs` (FASE 1, dentro de la tx — solo DB,
devuelve datos planos) y `buildApplePkpassFromInputs` (FASE 2, sin `tx`
en su firma — estructuralmente imposible que toque Postgre por
accidente, no solo "por convención"). Los 4 callers reales se
actualizaron para cerrar su `withTenantContext` ANTES de llamar a la
FASE 2; `generateApplePkpassForCustomer` se conserva como wrapper de
conveniencia (combina las dos fases) para no romper compatibilidad,
aunque ningún caller de producción lo sigue usando. Cuidado real
encontrado al migrar el web service público (`getLatestPass`): el status
code de "row no encontrada" (401) y el de "no se pudo generar" (404) son
casos distintos — una versión inicial del refactor los colapsaba en uno
solo, corregido antes de mergear. Cero cambio de comportamiento
observable: mismos bytes, mismos status codes, mismos headers. Suite
completa: 186/186.
