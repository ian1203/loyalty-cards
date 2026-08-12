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
ahora rompe la monotonía de "reja de tarjetas blancas" con secciones de
layout variado: `ProductShowcase.tsx` (teléfono CSS + `WalletCardMockup`
+ `DashboardGlance.tsx`, un vistazo estilizado SVG/CSS del dashboard real,
NO una captura ni un fake de divs), `ProblemSection.tsx` (único bloque
navy full-bleed de toda la página, rompe el fondo papel a propósito),
`HowItWorksStamps.tsx` (línea de tiempo con el motivo real de sellos en
vez de tarjetas numeradas genéricas), `ComponentsBento.tsx` (bento
asimétrico 1+2, no 3 tarjetas idénticas). `WalletCardMockup.tsx` está
parametrizado (`businessName`/`rewardLabel`/`stampsFilled`/
`stampsRequired`/`accentColor`/`logoSrc`/`compact`) — antes tenía
"Café Central" fijo a fuego.

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

**Pendiente, explícitamente NO hecho todavía**: FASE 2b (`/enroll`
público) y reportes/analítica siguen sin arrancar, ver abajo.

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

## Fase actual: sin definir todavía
FASE 2b (`/enroll` público) **ya se construyó y está en producción** —
esta sección quedó desactualizada, no se editó cuando se hizo (`apps/web/
app/(marketing)/enroll/[slug]/`, alta pública real con dedupe por
teléfono). Reportes/analítica sigue siendo el único candidato sin
empezar. Tampoco documentado aquí todavía (trabajo real ya hecho en
sesiones no reflejadas en este archivo — ver `git log` como fuente de
verdad más actual que esta sección): rate limiting distribuido
(`apps/web/lib/rateLimit.ts`, Upstash), offboarding real de empleados
(`/team`), captura de cumpleaños/ocupación en el alta, y notificación por
proximidad (Apple `locations`, Google `merchantLocations`) activa para
Chilaquikes. No empieces reportes/analítica sin pedir el alcance primero
— misma regla que rigió Fase 0 → 1 → 2 → 3 → 4.

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