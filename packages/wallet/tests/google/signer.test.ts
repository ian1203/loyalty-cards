import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { createFakeGoogleWalletClient } from "../../src/google/signer";

// El fake reusa el código REAL de firma/REST (ver comentario en
// src/google/signer.ts) contra una cuenta de servicio de prueba generada
// en memoria — estos tests ejercitan el mismo camino de firma que la impl
// real, solo con transporte simulado.

describe("createFakeGoogleWalletClient — buildSaveLink", () => {
  it("produce un link con un JWT RS256 bien formado (header + claims)", async () => {
    const client = createFakeGoogleWalletClient();

    const link = await client.buildSaveLink({
      loyaltyObjects: [{ id: "issuer.pass_abc123" }],
      origins: ["https://example.com"],
    });

    expect(link).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    const jwt = link.replace("https://pay.google.com/gp/v/save/", "");

    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe("RS256");

    const claims = decodeJwt(jwt);
    expect(claims.aud).toBe("google");
    expect(claims.typ).toBe("savetowallet");
    expect(claims.iss).toBe("fake@fake.iam.gserviceaccount.com");
    expect((claims.payload as { loyaltyObjects: unknown[] }).loyaltyObjects).toHaveLength(1);
    expect(claims.origins).toEqual(["https://example.com"]);
  });

  it("sin loyaltyObjects/origins, usa arrays vacíos por default (no revienta)", async () => {
    const client = createFakeGoogleWalletClient();
    const link = await client.buildSaveLink({});
    const jwt = link.replace("https://pay.google.com/gp/v/save/", "");
    const claims = decodeJwt(jwt);
    expect((claims.payload as { loyaltyObjects: unknown[] }).loyaltyObjects).toEqual([]);
  });
});

describe("createFakeGoogleWalletClient — upsertLoyaltyClass / upsertLoyaltyObject", () => {
  it("upsertLoyaltyClass nunca golpea la red: registra el POST (insert) con el payload exacto", async () => {
    const client = createFakeGoogleWalletClient();
    await client.upsertLoyaltyClass("issuer.biz_123", { id: "issuer.biz_123", issuerName: "Café Test" });

    expect(client.insertCalls).toHaveLength(1);
    expect(client.insertCalls[0].url).toContain("loyaltyClass");
    expect(client.insertCalls[0].payload).toEqual({ id: "issuer.biz_123", issuerName: "Café Test" });
    expect(client.patchCalls).toHaveLength(0);
  });

  it("upsertLoyaltyObject registra el POST con el payload exacto", async () => {
    const client = createFakeGoogleWalletClient();
    await client.upsertLoyaltyObject("issuer.pass_456", { id: "issuer.pass_456", classId: "issuer.biz_123" });

    expect(client.insertCalls).toHaveLength(1);
    expect(client.insertCalls[0].url).toContain("loyaltyObject");
    expect(client.insertCalls[0].payload.id).toBe("issuer.pass_456");
  });

  it("cada instancia del fake tiene su propio registro (sin estado compartido entre tests)", async () => {
    const clientA = createFakeGoogleWalletClient();
    const clientB = createFakeGoogleWalletClient();
    await clientA.upsertLoyaltyClass("a", { id: "a" });

    expect(clientA.insertCalls).toHaveLength(1);
    expect(clientB.insertCalls).toHaveLength(0);
  });
});

describe("createFakeGoogleWalletClient — addLoyaltyObjectMessage", () => {
  it("golpea el endpoint addMessage con el mensaje exacto (POST, mismo registro que insertCalls)", async () => {
    const client = createFakeGoogleWalletClient();
    await client.addLoyaltyObjectMessage("issuer.pass_456", {
      header: "¡Hola!",
      body: "Carlo, te faltan 2 sellos para tu recompensa",
      messageType: "TEXT_AND_NOTIFY",
    });

    expect(client.insertCalls).toHaveLength(1);
    expect(client.insertCalls[0].url).toContain("loyaltyObject/issuer.pass_456/addMessage");
    expect(client.insertCalls[0].payload).toEqual({
      message: {
        header: "¡Hola!",
        body: "Carlo, te faltan 2 sellos para tu recompensa",
        messageType: "TEXT_AND_NOTIFY",
      },
    });
  });
});
