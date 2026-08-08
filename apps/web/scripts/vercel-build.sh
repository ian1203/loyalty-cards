#!/usr/bin/env bash
set -euo pipefail

# Vercel usa esta convención de nombre ("vercel-build" en package.json) en
# vez de "build" automáticamente — el Root Directory del proyecto en
# Vercel es apps/web, así que este script arranca ahí. No hace falta un
# `cd` a la raíz del monorepo: `pnpm --filter` camina hacia arriba
# buscando pnpm-workspace.yaml sola, sin importar el cwd (confirmado
# corriendo `pnpm --filter @loyalty/db exec pwd` desde apps/web antes de
# escribir esto).
#
# El gate a VERCEL_ENV=production es obligatorio, no cosmético: Preview y
# Production comparten el mismo DATABASE_URL en este proyecto (confirmado
# en la auditoría de producción), así que sin este gate CUALQUIER preview
# deploy (cualquier PR) correría migraciones contra la base de datos real.
#
# `set -e` (parte de `set -euo pipefail` arriba) hace que un `pnpm ...
# migrate` que falle aborte este script ANTES de llegar a `next build` —
# Vercel nunca promueve un build que falla a servir tráfico, así que una
# migración rota nunca queda "detrás" de un deploy verde.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "[vercel-build] VERCEL_ENV=production — aplicando migraciones pendientes antes de compilar…"
  pnpm --filter @loyalty/db migrate
else
  echo "[vercel-build] VERCEL_ENV=${VERCEL_ENV:-unset} — se salta la migración (solo corre en production)."
fi

# --webpack: Turbopack (default de Next 16) pierde el binario nativo de
# sharp (packages/wallet, libvips) al tracear las funciones serverless —
# ERR_DLOPEN_FAILED en runtime pese a build "exitoso" (bug real: /enroll
# devolvía 500 en producción). webpack sí lo resuelve bien.
next build --webpack
