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

## Notificación por proximidad (geofence) — Apple + Google, en producción (no numerada)

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

## Superficie pública de marketing (paralela a las fases, no numerada)

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
(ver Reglas NO negociables). Las páginas de `(marketing)` son al revés:
deben ser estáticas, cacheables e indexables por diseño — nunca llaman
`cookies()`/`headers()`/`getVerifiedSession()`/`requireTenantSession()`,
que es justo lo que las deja renderizar estáticas por defecto en Next
(confirmado con `next build`: `/` y `/privacidad` salen ○ Static, el
resto del producto sale ƒ Dynamic). No hay conflicto con el
service worker: su allowlist ya son solo los dos íconos, así que nunca
intercepta estas rutas nuevas.

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

## Rediseño de producto — identidad visual, app shell, dashboard, landing (branch `feat/design-overhaul`, no numerado)

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

**Identidad visual — dirección "Sello"**: el objeto real detrás del
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

**Pendiente en el momento de este párrafo, ya NO pendiente hoy**: FASE 2b
(`/enroll` público) se construyó después — ver esa sección más abajo.
Reportes/analítica sigue siendo el único candidato sin arrancar.

## Pulido de UX del scanner (branch `feat/design-overhaul`, no numerado)

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

## Rebrand "Sello" → Pragmia (branch `feat/design-overhaul`, no numerado)

La dirección visual "Sello" (marino/coral, Space Grotesk/Inter, papel
cálido) descrita arriba quedó **reemplazada por completo** por la
identidad final de Pragmia — la sección de arriba es historia, no el
estado actual. Fuente de la marca: `pragmia-logo/` en la raíz del repo
(logo.jpeg, icon.jpeg, tipografias.jpeg, colores.jpeg — no trackeado en
git, son artes de referencia, no assets que la app cargue en runtime).

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

**"Negocio de Prueba" (local, no hosted)**: con tu visto bueno explícito,
se pobló con datos de demo de "Chilaquikes" — rebrand del negocio,
programa "Club de la Gorrita" (6 sellos), recompensa "Orden de
chilaquiles gratis", 2 sucursales, 1 empleado demo, 39 clientes con
nombres realistas e historial de 8 semanas (transacciones/redenciones con
fechas explícitas, no producido por `scanner/logic.ts` — esas funciones
siempre usan `now()` a propósito). Ejecutado vía un script `.test.ts` de
un solo uso (mismo patrón que corre dentro de Vitest para resolver los
imports extensionless de `logic.ts`/`testAuth.ts`), borrado después de
correrlo. Sigue siendo el mismo tenant local de siempre, no un negocio
hosted nuevo.

## FASE 2b — `/enroll` público, en producción (no numerada)

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

## Endurecimiento de seguridad — rate limiting, offboarding, búsqueda exacta (no numerada)

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
Admin API (`lib/employeeOffboarding.ts`, `banEmployeeAuth`). Esta es la
**primera excepción documentada** a "cero `adminDb` fuera de `/admin`"
para la superficie de Auth (no Postgres — `createAdminClient()` es la
API de administración de Supabase Auth, distinta de `adminDb`, pero el
mismo espíritu de la regla aplica): confinada a un solo archivo nombrado,
con un test estático permanente en `prod-readiness.test.ts` que enumera
los únicos archivos autorizados a importar `createAdminClient` — un uso
futuro fuera de esa lista falla el test, no queda en un comentario. No
revoca un access token YA emitido y vigente (imposible con JWT
stateless, ver Arquitectura) — `requireOperationContext` ya protege
sellar/canjear al instante; el resto de las rutas queda expuesto hasta
que ese token expire (≤1h), riesgo aceptado explícitamente para esta
ronda. Sin acción de reactivar todavía (deactivate-only, pedido así).

Revisión `tenant-security-reviewer`: sin hallazgos críticos/altos (1
MEDIO — cobertura del guard de `createAdminClient` en `components/`, y 1
BAJO — supuesto de proxy de confianza en `x-forwarded-for` para
`clientIp` — ambos corregidos antes de mergear).

## CI/CD — GitHub Actions + branch protection (no numerada)

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

## Perfil de cliente — cumpleaños, teléfono, ocupación (no numerada)

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
  todavía" (ya no aplica, ver la sección de Fase 4 arriba) y el sufijo
  "(prueba)" de ambos botones.
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

## Motor de lealtad — tope de recompensa vs. ciclo del programa (no numerada)

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

## Paginación real de `/customers` (no numerada)

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

## `/set-password` — sistema de diseño (no numerada)

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

## Datos de producción — limpieza de perfiles de prueba (no numerada)

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

## Fase actual: sin definir todavía
Reportes/analítica es el único candidato sin empezar y sin acotar. No lo
empieces sin pedir el alcance primero — misma regla que rigió Fase 0 → 1
→ 2 → 3 → 4 → 2b.

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
  Excepción, no contradicción: las páginas públicas de marketing
  (`apps/web/app/(marketing)/`) no tienen datos de tenant, así que para
  ellas la regla es la opuesta a propósito — deben ser estáticas y
  cacheables (ver la sección "Superficie pública de marketing").

## Convenciones
- Pregunta antes de instalar dependencias nuevas.
- No toques secretos ni los subas al repo; usa variables de entorno.