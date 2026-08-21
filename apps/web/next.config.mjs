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
//
// Reducción de peso real, hallazgo de auditoría de rendimiento (ver
// docs/HISTORY.md): el bundle de cada función serverless creció ~74% al
// agregar Sentry — confirmado con build local, no supuesto. Dos causas
// separadas, dos fixes separados:
// - `removeTracing: true`: @sentry/node importa ESTÁTICAMENTE (require de
//   nivel de módulo, no tree-shakeable por defecto) instrumentación
//   automática para Express/Fastify/Kafka/MongoDB/Redis/LangChain/OpenAI/
//   etc. — NINGUNA de las cuales usa esta app — solo por tener
//   `@sentry/nextjs` importado, sin importar `tracesSampleRate`. Esta
//   plataforma nunca usó tracing (`tracesSampleRate: 0` desde el día 1,
//   solo error tracking) — este flag tree-shakea ese código completo.
// - `autoInstrumentServerFunctions`/`autoInstrumentMiddleware`/
//   `autoInstrumentAppDirectory: false`: el wrapping automático de Sentry
//   sobre cada route/middleware/componente es el mecanismo que alimenta
//   `onRequestError` — que esta app deliberadamente NO usa (ver
//   instrumentation.ts: captura automática expondría PII de rutas nunca
//   auditadas). Sin ese hook, el wrapping corre en cada request sin que
//   nada consuma su resultado — puro costo, cero beneficio. La
//   instrumentación real de esta app es 100% manual
//   (captureServerError(), ver lib/observability/).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: {
    treeshake: { removeDebugLogging: true, removeTracing: true },
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
    automaticVercelMonitors: false,
  },
});
