import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

// vi.spyOn directo sobre @sentry/nextjs revienta ("Cannot redefine
// property", namespace ESM no configurable) — mismo patrón que
// observability-verification.test.ts.
vi.mock("@sentry/nextjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/nextjs")>();
  return { ...actual, captureException: vi.fn() };
});
import * as Sentry from "@sentry/nextjs";
import { captureServerError } from "../lib/observability/captureServerError";

// Hallazgo real de tenant-security-reviewer (ronda de observabilidad):
// DrizzleQueryError.message = "Failed query: <sql>\nparams: <valores>" —
// los valores REALES bindeados a la query (que en enroll_customer_public
// son nombre/teléfono/email/fecha de nacimiento/wallet_token) viajaban tal
// cual hasta Sentry.captureException para cualquier fallo no tipado
// explícitamente. Esta prueba construye un DrizzleQueryError REAL (no un
// mock a mano) con parámetros que parecen PII, y confirma que
// captureServerError() lo sanea ANTES de que le llegue a Sentry.
describe("captureServerError — sanea DrizzleQueryError antes de reportarlo", () => {
  afterEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("nunca deja pasar los params reales de la query (PII/wallet_token) en el error capturado", () => {
    const piiName = "Ana ProvocadaTest DrizzleSanitize";
    const piiPhone = "+525599887766";
    const piiEmail = "ana.drizzle.sanitize@test.dev";
    const secretWalletToken = "SECRET-WALLET-TOKEN-drizzle-sanitize";

    const pgError = new Error("duplicate key value violates unique constraint") as Error & { code?: string };
    pgError.code = "23505";

    const realDrizzleError = new DrizzleQueryError(
      "insert into customers (full_name, phone, email, wallet_token) values ($1, $2, $3, $4)",
      [piiName, piiPhone, piiEmail, secretWalletToken],
      pgError,
    );

    // Confirma la premisa del hallazgo: sin sanear, la PII SÍ está en el
    // mensaje del error real de drizzle-orm (si esto deja de ser cierto en
    // una versión futura de drizzle-orm, esta prueba debe fallar acá, no
    // dar un falso positivo más abajo).
    expect(realDrizzleError.message).toContain(piiName);
    expect(realDrizzleError.message).toContain(secretWalletToken);

    captureServerError(realDrizzleError, { operation: "enroll.customer", severity: "critical" });

    const captureSpy = vi.mocked(Sentry.captureException);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const reportedError = captureSpy.mock.calls[0][0];
    const serialized = JSON.stringify({
      message: (reportedError as Error).message,
      name: (reportedError as Error).name,
      stack: (reportedError as Error).stack,
    });

    expect(serialized).not.toContain(piiName);
    expect(serialized).not.toContain(piiPhone);
    expect(serialized).not.toContain(piiEmail);
    expect(serialized).not.toContain(secretWalletToken);
    // El código de Postgres SÍ sobrevive — es diagnóstico útil, no un dato.
    expect((reportedError as Error).message).toContain("23505");
  });

  it("un Error normal (no DrizzleQueryError) pasa sin modificar", () => {
    const plainError = new Error("boom-normal-error");
    captureServerError(plainError, { operation: "scanner.stamp", severity: "critical" });

    const captureSpy = vi.mocked(Sentry.captureException);
    expect(captureSpy.mock.calls[0][0]).toBe(plainError);
  });
});
