import * as Sentry from "@sentry/nextjs";

// Único punto sancionado para mandar una excepción real a Sentry desde
// código server-only — mismo espíritu que otros puntos sancionados del
// proyecto (getVerifiedSession, findInTenant): un solo lugar reviewable en
// vez de que cada call site arme su propio objeto de contexto a mano.
//
// PRIMERA línea de defensa contra fuga de PII/secretos: `extra` solo acepta
// primitivos (string/number/boolean/null), nunca un objeto — así es
// IMPOSIBLE pasar por error un customer/formData/session completo, el
// compilador lo rechaza. Cada call site debe elegir explícitamente qué
// campos individuales pasar (business_id, operation, code numérico, etc.),
// nunca "todo lo que tengo a mano". La SEGUNDA línea (por si esta disciplina
// falla) es el beforeSend/beforeBreadcrumb en sentry.server.config.ts
// (scrub.ts) — nunca confíes en una sola capa.
//
// NUNCA pases: wallet_token, push token, cookies, headers de Authorization,
// ni ningún campo de PII de cliente (nombre, teléfono, email, cumpleaños,
// ocupación, dirección). Solo identificadores internos (business_id,
// customer_id como UUID opaco) y metadata de la operación.
type ServerErrorContext = {
  /** Qué ruta/operación falló — usado como tag, agrupa eventos en Sentry. */
  operation:
    | "wallet.notify.apple"
    | "wallet.notify.google"
    | "wallet.notify.query"
    | "scanner.lookup"
    | "scanner.stamp"
    | "scanner.redeem"
    | "enroll.customer"
    | "enroll.wallet_artifacts";
  /** UUID del negocio afectado — nunca PII, es el identificador tenant. */
  businessId?: string;
  /** Severidad para las reglas de alerta (ver docs/HISTORY.md, ronda de observabilidad). */
  severity?: "critical" | "warning";
  /** Campos primitivos adicionales de diagnóstico — nunca objetos/arrays. */
  extra?: Record<string, string | number | boolean | null | undefined>;
};

// Hallazgo real de tenant-security-reviewer (ronda de observabilidad):
// `DrizzleQueryError` (drizzle-orm/errors.js) construye su `.message` como
// `Failed query: <sql>\nparams: <valores>` — el ARRAY REAL de parámetros
// bindeados de la query, coaccionado a string. En `enroll_customer_public`
// (enroll.ts) esos parámetros son literalmente nombre/teléfono/email/fecha
// de nacimiento/ocupación/dirección/wallet_token — cualquier fallo de esa
// query que no sea uno de los dos casos ya tipados (teléfono duplicado,
// negocio inexistente) relanzaba ese error TAL CUAL hacia arriba, y de ahí
// a `captureServerError` sin pasar por ningún saneo (ni el tipado de
// `extra` arriba, que nunca toca el objeto `error` mismo, ni el scrub de
// `sentry.server.config.ts`, que solo mira email/corridas de dígitos en
// texto libre — un nombre, una fecha `YYYY-MM-DD`, o un wallet_token
// alfanumérico no matchean ninguno de los dos). Mismo vector, superficie
// más angosta, en el lookup del scanner por `wallet_token` del QR.
//
// Fix CENTRALIZADO acá (no solo en los 2 call sites encontrados): CUALQUIER
// error con la forma de un DrizzleQueryError (tiene `.query`/`.params`
// propios — la señal más precisa, no depender de parsear el mensaje) se
// reconstruye con un mensaje limpio ANTES de llegar a Sentry.captureException
// — cubre estos 2 casos y cualquier otro call site futuro de
// captureServerError() que alguna vez deje pasar un error de DB sin
// envolver, sin depender de que cada desarrollador lo recuerde.
function isDrizzleQueryErrorShaped(error: unknown): error is Error & { query?: unknown; params?: unknown } {
  return error instanceof Error && "query" in error && "params" in error;
}

function sanitizeErrorForReporting(error: unknown): unknown {
  if (!isDrizzleQueryErrorShaped(error)) return error;
  const cause = error.cause as { code?: string } | undefined;
  const sanitized = new Error(`${error.name}: query failed${cause?.code ? ` (pg code=${cause.code})` : ""}`);
  sanitized.name = error.name;
  return sanitized;
}

export function captureServerError(error: unknown, context: ServerErrorContext): void {
  Sentry.captureException(sanitizeErrorForReporting(error), {
    tags: {
      operation: context.operation,
      severity: context.severity ?? "warning",
    },
    extra: {
      businessId: context.businessId ?? null,
      ...context.extra,
    },
  });
}
