import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 bloquea por default los recursos de dev (HMR, y con eso la
  // hidratación del cliente en dev) si el Origin no está en esta lista —
  // "127.0.0.1" NO cuenta como "localhost" automáticamente, y un túnel
  // (cloudflared, para probar en teléfono real) tampoco. Sin esto, el JS
  // nunca hidrata: los <form> quedan como HTML inerte (sin handlers de
  // React), un submit real hace un GET nativo a la misma URL — el bug de
  // "el login no redirige" que bloqueaba la demo. Solo afecta `next dev`
  // (build de producción no tiene este runtime).
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.trycloudflare.com"],
};

// Source maps de subida a Sentry: activados — SENTRY_AUTH_TOKEN/ORG/PROJECT
// ya están configurados (ver docs/HISTORY.md, ronda de observabilidad) y
// @sentry/cli ya está aprobado en pnpm-workspace.yaml (`allowBuilds`). Sin
// el auth token, este mismo plugin loguea un warning y omite la subida sin
// fallar el build — no hace falta un flag separado para el caso "todavía
// no hay token".
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true }, automaticVercelMonitors: false },
});
