import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./lib/observability/scrub";

// Init server-only — ver instrumentation.ts, solo se importa en runtime
// "nodejs" (nunca edge, nunca bundle de navegador: no hay SDK de cliente en
// esta ronda a propósito, ver claude.md/docs/HISTORY.md). Sin DSN, Sentry
// SDK se vuelve un no-op silencioso — no revienta el arranque si falta.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // Solo error tracking en esta ronda, no performance monitoring — no hace
  // falta para el objetivo (enterarse de fallos), y cada trace es más datos
  // saliendo hacia el proveedor externo sin necesidad real.
  tracesSampleRate: 0,

  // Explícito aunque ya sea el default del SDK: nunca adjuntar IP/cookies/
  // headers completos "porque sí" (ver Reglas NO negociables, claude.md).
  sendDefaultPii: false,

  // Sin integration de Console: los call sites ya hacen console.error() Y
  // captureServerError() por separado (ver captureServerError.ts) — sin
  // esto, el mismo error terminaría duplicado como breadcrumb automático
  // con argumentos crudos que no pasaron por el scrub de captureServerError.
  integrations: (integrations) => integrations.filter((integration) => integration.name !== "Console"),

  // Segunda línea de defensa contra PII/secretos (ver scrub.ts) — nunca la
  // única, pero tampoco opcional: por si un integration por default de
  // Sentry (fetch/http breadcrumbs, contexto de request) adjunta algo con
  // una key sensible antes de que el evento salga de la app.
  beforeSend(event) {
    return scrubSensitiveData(event as unknown as Record<string, unknown>) as unknown as typeof event;
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubSensitiveData(breadcrumb as unknown as Record<string, unknown>) as unknown as typeof breadcrumb;
  },
});
