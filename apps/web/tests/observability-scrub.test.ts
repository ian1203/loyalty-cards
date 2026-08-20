import { describe, expect, it } from "vitest";
import { scrubSensitiveData } from "../lib/observability/scrub";

// Prueba pura, sin DB/sesión — verifica la SEGUNDA línea de defensa contra
// fuga de PII/secretos hacia Sentry (ver captureServerError.ts para la
// primera: tipos que solo aceptan primitivos). No basta con "el SDK está
// instalado" — esto confirma que el filtro realmente actúa antes de que
// cualquier evento salga de la app.
describe("scrubSensitiveData", () => {
  it("redacta valores bajo keys sensibles conocidas (token, PII de cliente, secretos)", () => {
    const event = {
      message: "algo falló",
      extra: {
        wallet_token: "abc123opaque",
        pushToken: "device-push-token-real",
        customerFullName: "María González",
        phone: "5551234567",
        email: "maria@example.com",
        dateOfBirth: "1990-05-01",
        occupation: "Enfermera",
        shippingAddress: "Calle Falsa 123",
        password: "hunter2",
        businessId: "fc2b93bb-01ca-43f9-9edf-0782abb514b4",
        operation: "scanner.stamp",
      },
      request: {
        headers: { authorization: "Bearer real-secret-jwt", cookie: "sb-token=real" },
      },
    };

    const scrubbed = scrubSensitiveData(event) as typeof event;

    expect(scrubbed.extra.wallet_token).toBe("[Filtered]");
    expect(scrubbed.extra.pushToken).toBe("[Filtered]");
    expect(scrubbed.extra.customerFullName).toBe("[Filtered]");
    expect(scrubbed.extra.phone).toBe("[Filtered]");
    expect(scrubbed.extra.email).toBe("[Filtered]");
    expect(scrubbed.extra.dateOfBirth).toBe("[Filtered]");
    expect(scrubbed.extra.occupation).toBe("[Filtered]");
    expect(scrubbed.extra.shippingAddress).toBe("[Filtered]");
    expect(scrubbed.extra.password).toBe("[Filtered]");
    expect(scrubbed.request.headers.authorization).toBe("[Filtered]");
    expect(scrubbed.request.headers.cookie).toBe("[Filtered]");

    // Lo que SÍ debe sobrevivir intacto — es el contexto accionable que
    // justifica tener observabilidad en primer lugar.
    expect(scrubbed.extra.businessId).toBe("fc2b93bb-01ca-43f9-9edf-0782abb514b4");
    expect(scrubbed.extra.operation).toBe("scanner.stamp");
    expect(scrubbed.message).toBe("algo falló");
  });

  it("redacta email/teléfono embebidos en TEXTO LIBRE (p.ej. detail de Postgres), no solo bajo una key sensible", () => {
    const event = {
      exception: {
        values: [
          {
            type: "Error",
            value:
              'duplicate key value violates unique constraint "customers_business_phone_idx" — Detail: Key (phone)=(5551234567) already exists. contact maria@example.com for help.',
          },
        ],
      },
    };

    const scrubbed = scrubSensitiveData(event) as typeof event;
    const scrubbedMessage = scrubbed.exception.values[0].value;

    expect(scrubbedMessage).not.toContain("5551234567");
    expect(scrubbedMessage).not.toContain("maria@example.com");
    // El resto del mensaje (útil para diagnosticar QUÉ constraint violó)
    // debe sobrevivir — no se descarta el evento completo por un match.
    expect(scrubbedMessage).toContain("customers_business_phone_idx");
  });

  it("no revienta con eventos anidados profundos ni con valores null/undefined", () => {
    const event = {
      a: { b: { c: { d: { e: { f: { g: "muy profundo" } } } } } },
      nothing: null,
      missing: undefined,
      list: [{ phone: "5559876543" }, "texto normal"],
    };

    expect(() => scrubSensitiveData(event)).not.toThrow();
    const scrubbed = scrubSensitiveData(event) as any;
    expect(scrubbed.list[0].phone).toBe("[Filtered]");
    expect(scrubbed.list[1]).toBe("texto normal");
  });
});
