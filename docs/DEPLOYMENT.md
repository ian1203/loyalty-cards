# Deployment a producción — Supabase hosted + Vercel

## 1. Resumen

Esta guía cubre el primer deployment real de la plataforma: un proyecto
Supabase hosted (Postgres + Auth) y un proyecto Vercel (Next.js). Es la
primera vez que la app sale de local/CI, así que antes de seguir estos
pasos se corrió una auditoría completa de scoping de secretos, runtime,
arranque sin credenciales de Wallet, y — el gate más importante — la
suite completa de aislamiento multi-tenant contra el TRANSACTION POOLER
real de producción (no solo la conexión directa local). Ver el historial
de `chore/prod-readiness` para el detalle de esa auditoría.

**Prerrequisitos**: cuenta de Supabase, cuenta de Vercel, `supabase` CLI
instalado (`brew install supabase/tap/supabase` o equivalente).

**Frontera de responsabilidad**: crear el proyecto Supabase y cargar las
env vars en Vercel son las DOS únicas acciones que requieren acceso a un
panel — las hace quien tenga esas cuentas. Todo lo demás (aplicar
migraciones, registrar el hook de Auth, rotar la contraseña de `app_user`,
correr el gate) se hace por CLI.

## 2. Env vars — tabla completa

| Variable | Scope | De dónde sale | Dónde va |
|---|---|---|---|
| `DATABASE_URL` | Server-only | Supabase → Settings → Database → Connection string → **Transaction pooler**, rol `postgres` (mismo password que se fija al crear el proyecto) | Vercel: Production + Preview |
| `APP_DATABASE_URL` | Server-only | Transaction pooler, rol `app_user` — **la contraseña NO es la del rol `postgres`**: se rota una sola vez después de aplicar migraciones (§4), nunca es la que trae la migración por default | Vercel: Production + Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Público (`NEXT_PUBLIC_`) | Supabase → Settings → API → Project URL | Vercel: Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público (`NEXT_PUBLIC_`) | Supabase → Settings → API → `anon` `public` key — seguro exponerlo, RLS/Auth deciden qué puede hacer | Vercel: Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only, nunca `NEXT_PUBLIC_`** | Supabase → Settings → API → `service_role` `secret` key — bypasea RLS por completo; solo lo lee `lib/supabase/server.ts` (`createAdminClient`), confinado al camino de `/admin` | Vercel: Production + Preview |
| `NEXT_PUBLIC_SITE_URL` | Público (`NEXT_PUBLIC_`) | El dominio real una vez configurado (§7 — **pendiente**) | Vercel: Production (dominio real), Preview (la URL de preview que asigna Vercel) |
| `WALLET_APPLE_*` (7 variables) | Server-only | `docs/WALLET-SETUP.md` — **opcionales**: su ausencia es un estado válido (cae a la impl fake, logueado como INFO, nunca crashea el arranque — verificado en `chore/prod-readiness`) | Vercel: Production, cuando existan las credenciales reales |
| `WALLET_GOOGLE_*` (2 variables) | Server-only | `docs/WALLET-SETUP.md` — mismo criterio: opcionales, fallback fake | Vercel: Production, cuando existan |

**Regla no negociable, reforzada por `apps/web/tests/prod-readiness.test.ts`**:
ningún nombre de variable con prefijo `NEXT_PUBLIC_` puede contener
`SERVICE_ROLE`, y `SUPABASE_SERVICE_ROLE_KEY` solo puede referenciarse
desde `lib/supabase/server.ts` — el test falla si algo lo viola.

**`DATABASE_URL` y `APP_DATABASE_URL` son obligatorias JUNTAS**:
`packages/db/src/client.ts` construye ambos `Pool` al importar el
paquete (`requireEnv` revienta si falta cualquiera de las dos) — faltar
una sola rompe el cold start de CUALQUIER función de Vercel que toque
`@loyalty/db`, no solo `/admin`. En Vercel, ambas van con el TRANSACTION
POOLER (puerto `6543`) — nunca la conexión directa, que solo se usa una
vez, a mano, para aplicar migraciones (§4).

## 3. Panel Supabase (lo hace quien tenga la cuenta)

1. Crear el proyecto en https://supabase.com/dashboard — elegir la
   región más cercana a los usuarios finales (no se puede cambiar
   después sin recrear el proyecto). Fijar un password fuerte para el
   rol `postgres` — es el que va en la connection string directa.
2. Copiar de Settings → Database: la connection string **directa**
   (`db.<ref>.supabase.co:5432`) y la del **transaction pooler**
   (`aws-...pooler.supabase.com:6543`).
3. Copiar de Settings → API: `Project URL`, `anon` key, `service_role`
   key.
4. Pasar esos 4 datos (project ref, password, ambas connection strings)
   a quien vaya a correr los pasos de CLI del §4 — nunca por un canal
   que quede en texto plano de forma permanente si se puede evitar.

## 4. CLI — aplicar el esquema al proyecto hosted

```bash
supabase login --token <personal-access-token>   # sbp_... generado en
                                                   # supabase.com/dashboard/account/tokens
supabase link --project-ref <ref> --password '<password de postgres>'
supabase config push                              # registra el custom
                                                   # access token hook
                                                   # (supabase/config.toml)

# Migraciones — con el mecanismo real de este repo (Drizzle), NO
# `supabase db push`: ese comando lee de supabase/migrations/, carpeta
# que no existe acá — las migraciones reales viven en
# packages/db/migrations/ y las aplica el migrator de Drizzle. Usar los
# dos sistemas a la vez divergiría el tracking de qué se aplicó.
DATABASE_URL='<connection string DIRECTA>' \
  node --experimental-strip-types packages/db/src/migrate.ts

# Rotar la contraseña de app_user — la migración 0002_rls_policies.sql
# la crea con PASSWORD 'app_user' (pensado solo para Postgres local).
# Generar una fuerte y ALTER ROLE, UNA sola vez, nunca en una migración
# versionada (debe diferir por ambiente):
psql '<connection string DIRECTA>' -c \
  "ALTER ROLE app_user WITH PASSWORD '<password fuerte generada>';"
```

Con la contraseña rotada, armar `APP_DATABASE_URL` reemplazando el
usuario/password en la connection string del TRANSACTION POOLER:
`postgresql://app_user.<ref>:<password rotada>@<host-pooler>:6543/postgres`.

**⚠️ Efecto secundario de `supabase config push` a tener en cuenta**:
empuja `supabase/config.toml` COMPLETO, no solo el hook — incluye
`site_url`/`additional_redirect_urls` (van a quedar en `127.0.0.1` hasta
que se configure el dominio real, §7) y `enable_confirmations` (el
config local de dev lo tiene en `false` por velocidad de iteración, así
que el push lo apaga también en el proyecto hosted). El modelo de
seguridad de esta app no depende de la confirmación de email — el
verdadero gate es el custom access token hook (sin fila en
`users`/`platform_admins`, sin `business_id`/`is_platform_admin` en el
JWT, sin acceso, sin importar si el email está confirmado) — pero
`enable_confirmations = false` en un proyecto real igual no es el
default correcto a largo plazo. Antes de habilitar signup real (que hoy
esta app no expone en su UI — el alta de dueño es siempre vía invitación
desde `/admin`), volver a activarlo desde el dashboard de Supabase
(Authentication → Providers → Email → "Confirm email").

## 5. Panel Vercel (lo hace quien tenga la cuenta)

1. Importar el repo de GitHub.
2. Cargar cada variable de la tabla del §2, marcando el scope
   (Production / Preview / ambas según la tabla).
3. Primer deploy. Confirmar que `/` responde y que `/admin` (con una
   sesión de platform admin) puede dar de alta el primer negocio — es el
   único camino que usa `adminDb`/`SUPABASE_SERVICE_ROLE_KEY`.

## 6. Flujo PR → preview → merge

Cada PR contra `main` genera un deploy preview de Vercel automático, con
su propia URL — usa las mismas env vars marcadas "Preview" en el §2
(mismo proyecto Supabase que producción hoy; si el volumen lo justifica
más adelante, separar un proyecto Supabase de staging es una decisión de
una fase futura, no de esta). Revisar la preview (navegar las rutas
públicas, confirmar que no haya errores de consola) antes de aprobar. El
merge a `main` dispara el deploy de Production — con URL real pero sin
anuncio público: un deploy CONTROLADO, no un lanzamiento.

## 7. Dominio — pendiente

**No se toca en esta tarea a propósito** — queda como pendiente de quien
administre el dominio. Cuando se configure, alimenta:

- `NEXT_PUBLIC_SITE_URL` (Vercel, Production) — hoy no está seteada para
  producción real.
- Los `origins` del JWT del link "Add to Google Wallet"
  (`apps/web/lib/wallet/googleSaveLink.ts`).
- El `webServiceURL` embebido en el `.pkpass` de Apple
  (`apps/web/lib/wallet/passGeneration.ts`).
- `site_url`/`additional_redirect_urls` en `supabase/config.toml` (hoy
  apuntan a `127.0.0.1`, ver §4) — requiere otro `supabase config push`
  una vez actualizado el `.toml` con el dominio real.

Ninguno de estos cuatro puntos se modificó en esta tarea — todos quedan
funcionando con el fallback de dev hasta que el dominio exista.

## 8. El gate del pooler — verificación PERMANENTE, no un checkbox único

Antes de CUALQUIER deploy futuro que toque `packages/db` (esquema, RLS,
`withTenantContext`), correr la suite completa contra el pooler real de
producción — no alcanza con la conexión directa local, que se comporta
distinto en el manejo de conexión/`SET LOCAL` (la clase exacta de bug
que ya cubre `packages/db/tests/pooling-regression.test.ts`):

```bash
TEST_DATABASE_URL='<directa>' TEST_APP_DATABASE_URL='<pooler, app_user>' \
  pnpm --filter @loyalty/db test
TEST_DATABASE_URL='<directa>' TEST_APP_DATABASE_URL='<pooler, app_user>' \
  DATABASE_URL='<directa>' APP_DATABASE_URL='<pooler, app_user>' \
  NEXT_PUBLIC_SUPABASE_URL='<project url>' \
  NEXT_PUBLIC_SUPABASE_ANON_KEY='<anon key>' \
  SUPABASE_SERVICE_ROLE_KEY='<service role key>' \
  pnpm --filter @loyalty/web test
```

Correrlo 3 veces seguidas sin flakiness antes de confiar el resultado —
mismo criterio que se usó para este primer deploy. Si algo falla contra
el pooler, DETENERSE — no avanzar al deploy hasta entenderlo.
