import forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import { createFakePkpassSigner, createRealPkpassSigner } from "../../src/apple/signer";
import { generateFakeAppleCertBundle, type FakeAppleCertBundle } from "../support/fakeAppleCert";

describe("createRealPkpassSigner — PKCS#7 real con cert autofirmado", () => {
  let cert: FakeAppleCertBundle;

  beforeAll(() => {
    // Una sola llamada a openssl para todo el archivo — generar un cert
    // RSA de 2048 bits toma un rato real, no hace falta uno por test.
    cert = generateFakeAppleCertBundle();
  });

  it("produce una firma PKCS#7 DER válida y parseable sobre el manifest", async () => {
    const sign = createRealPkpassSigner(cert);
    const manifest = Buffer.from(JSON.stringify({ "pass.json": "abc123" }));

    const signature = await sign(manifest);

    // Si esto parsea como PKCS#7 sin lanzar, la firma es estructuralmente
    // válida — es la verificación real de que "cada línea del código de
    // firma corre", no un mock.
    const asn1 = forge.asn1.fromDer(signature.toString("binary"));
    const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData;
    expect(p7.certificates.length).toBeGreaterThan(0);
  });

  it("la cadena de certificados incluye el cert del pase Y el WWDR", async () => {
    const sign = createRealPkpassSigner(cert);
    const manifest = Buffer.from(JSON.stringify({ "pass.json": "abc123" }));

    const signature = await sign(manifest);
    const asn1 = forge.asn1.fromDer(signature.toString("binary"));
    const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData;

    expect(p7.certificates).toHaveLength(2);
  });

  it("dos manifests distintos producen firmas distintas", async () => {
    const sign = createRealPkpassSigner(cert);
    const sigA = await sign(Buffer.from(JSON.stringify({ a: 1 })));
    const sigB = await sign(Buffer.from(JSON.stringify({ a: 2 })));

    expect(sigA.equals(sigB)).toBe(false);
  });

  it("un certificado/llave inválidos lanzan en vez de devolver una firma silenciosa", () => {
    // El parseo de PEM corre al construir el signer (una sola vez por
    // proceso, ver comentario en signer.ts), no en cada firma — así que
    // ahora el throw ocurre acá, no al invocar sign(). Falla más rápido
    // (en la resolución de config, no en medio de una request real) sin
    // perder la garantía original: nunca una firma silenciosa con
    // credenciales rotas.
    expect(() =>
      createRealPkpassSigner({
        passCertPem: "not-a-cert",
        passKeyPem: "not-a-key",
        wwdrCertPem: "not-a-cert",
      }),
    ).toThrow();
  });
});

describe("createFakePkpassSigner", () => {
  it("es determinística sobre el mismo input y no requiere certificado", async () => {
    const sign = createFakePkpassSigner();
    const manifest = Buffer.from(JSON.stringify({ x: 1 }));

    const a = await sign(manifest);
    const b = await sign(manifest);
    expect(a.equals(b)).toBe(true);
  });
});
