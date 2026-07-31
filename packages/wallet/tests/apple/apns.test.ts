import { generateKeyPairSync } from "node:crypto";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import {
  buildApnsAuthToken,
  createFakeApnsSender,
  createRealApnsSender,
  type ApnsCredentials,
  type ApnsHttp2Post,
} from "../../src/apple/apns";

// Llave EC P-256 real generada en memoria (node:crypto) — jose exige una
// llave que parsee de verdad para correr su código real de firma ES256;
// no hace falta la llave .p8 real de Apple para probar la CONSTRUCCIÓN
// del JWT, solo una llave EC válida cualquiera.
const { privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const credentials: ApnsCredentials = {
  teamId: "TEAM123",
  apnsKeyId: "KEYID123",
  apnsPrivateKeyPem: privateKey,
};

describe("buildApnsAuthToken — construcción del JWT .p8, sin red", () => {
  it("produce un JWT ES256 con kid/iss/iat correctos", async () => {
    const token = await buildApnsAuthToken(credentials);

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("KEYID123");

    const claims = decodeJwt(token);
    expect(claims.iss).toBe("TEAM123");
    expect(typeof claims.iat).toBe("number");
  });

  it("dos llamadas producen JWTs distintos (iat cambia)", async () => {
    const a = await buildApnsAuthToken(credentials);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const b = await buildApnsAuthToken(credentials);
    expect(a).not.toBe(b);
  });
});

describe("createRealApnsSender — payload vacío, envío de red mockeado", () => {
  it("manda el payload vacío '{}' con los headers correctos, vía el post inyectado (nunca red real)", async () => {
    const calls: Array<{ pushToken: string; headers: Record<string, string>; body: string }> = [];
    const fakePost: ApnsHttp2Post = async (input) => {
      calls.push(input);
      return { status: 200, body: "" };
    };

    const send = createRealApnsSender(credentials, fakePost);
    await send({ pushToken: "device-token-abc", passTypeIdentifier: "pass.dev.loyalty" });

    expect(calls).toHaveLength(1);
    expect(calls[0].pushToken).toBe("device-token-abc");
    expect(calls[0].body).toBe("{}");
    expect(calls[0].headers["apns-topic"]).toBe("pass.dev.loyalty");
    expect(calls[0].headers.authorization).toMatch(/^bearer /);
  });

  it("un status fuera de 2xx lanza (para que el caller decida el reintento)", async () => {
    const fakePost: ApnsHttp2Post = async () => ({ status: 410, body: "Unregistered" });
    const send = createRealApnsSender(credentials, fakePost);

    await expect(
      send({ pushToken: "stale-token", passTypeIdentifier: "pass.dev.loyalty" }),
    ).rejects.toThrow(/410/);
  });
});

describe("createFakeApnsSender", () => {
  it("nunca golpea la red, solo registra qué hubiera mandado", async () => {
    const sent: Array<{ pushToken: string; passTypeIdentifier: string }> = [];
    const send = createFakeApnsSender(sent);

    await send({ pushToken: "t1", passTypeIdentifier: "pass.dev.loyalty" });
    await send({ pushToken: "t2", passTypeIdentifier: "pass.dev.loyalty" });

    expect(sent).toEqual([
      { pushToken: "t1", passTypeIdentifier: "pass.dev.loyalty" },
      { pushToken: "t2", passTypeIdentifier: "pass.dev.loyalty" },
    ]);
  });
});
