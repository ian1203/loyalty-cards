// Hook de arranque de Next.js (App Router) — corre una vez por instancia de
// servidor. Solo cargamos la config de Sentry en runtime "nodejs": esta
// plataforma es Node-first a propósito (ver claude.md, "runtime Node para
// todo lo que toca pg") y las 4 rutas instrumentadas en esta ronda
// (notify.ts, scanner/logic.ts, enroll/logic.ts) corren todas ahí, nunca en
// Edge — no hay necesidad real de un sentry.edge.config.ts todavía.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// A propósito, NO se exporta `onRequestError` (Sentry.captureRequestError):
// esa automática le manda a Sentry el request completo de CUALQUIER ruta
// que truene — incluidas rutas con PII en el body (alta manual de cliente,
// /rewards, etc.) que nunca se auditaron para este filtro. `next build` va
// a advertir por esto ("outdated configuration") — es la advertencia
// esperada de esta decisión, no un olvido. Esta ronda de observabilidad es
// deliberadamente angosta: solo las 4 rutas instrumentadas a mano en
// notify.ts/scanner/logic.ts/enroll/logic.ts (ver captureServerError.ts),
// cada una con su propio scrub explícito de qué contexto es seguro pasar.
// Antes de agregar onRequestError, hay que auditar TODAS las rutas que
// tocaría, no solo asumir que el scrub genérico de sentry.server.config.ts
// alcanza.
