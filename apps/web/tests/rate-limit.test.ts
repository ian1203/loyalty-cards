import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitersForTests } from "../lib/rateLimit";

// checkRateLimit contra Upstash REAL (ventana/máximo real, dos keys que no
// se interfieren) requiere credenciales UPSTASH_REDIS_REST_URL/TOKEN de un
// proyecto de test dedicado — no disponibles en este entorno (ver plan de
// endurecimiento de seguridad). Lo que SÍ se puede probar sin red real es
// el contrato de fail-open, que es lo que protege dev/CI/producción sin
// esas credenciales configuradas.

describe("checkRateLimit — fail-open sin credenciales de Upstash", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitersForTests();
  });

  afterAll(() => {
    if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    resetRateLimitersForTests();
  });

  it("sin env vars, permite siempre (fail-open)", async () => {
    const result = await checkRateLimit("customer_search_employee", "fake-key");
    expect(result.allowed).toBe(true);
  });

  it("loguea la advertencia de falta de config UNA sola vez por proceso", async () => {
    const warnings: unknown[][] = [];
    const logger = { warn: (...args: unknown[]) => warnings.push(args) };

    await checkRateLimit("customer_search_employee", "fake-key-1", { logger });
    await checkRateLimit("customer_search_employee", "fake-key-2", { logger });
    await checkRateLimit("scanner_lookup_employee", "fake-key-3", { logger });

    expect(warnings).toHaveLength(1);
  });

  it("resetRateLimitersForTests permite que la advertencia vuelva a loguearse", async () => {
    const logger = { warn: () => {} };
    const warnings: unknown[][] = [];
    const trackingLogger = { warn: (...args: unknown[]) => warnings.push(args) };

    await checkRateLimit("customer_search_employee", "fake-key", { logger });
    resetRateLimitersForTests();
    await checkRateLimit("customer_search_employee", "fake-key", { logger: trackingLogger });

    expect(warnings).toHaveLength(1);
  });
});
