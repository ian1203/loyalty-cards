import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPkpass } from "../../src/apple/bundle";
import { buildPassJson, type PassJsonInput } from "../../src/apple/passJson";
import { createFakePkpassSigner, createRealPkpassSigner, type PkpassSigner } from "../../src/apple/signer";
import { generateFakeAppleCertBundle, type FakeAppleCertBundle } from "../support/fakeAppleCert";

const passJsonInput: PassJsonInput = {
  serialNumber: "22222222-2222-2222-2222-222222222222",
  authenticationToken: "auth-token-abc",
  webServiceUrl: "https://example.com/api/wallet/apple",
  passTypeIdentifier: "pass.dev.loyalty",
  teamIdentifier: "TEAM123",
  organizationName: "Cafetería Test",
  programName: "Tarjeta de sellos",
  customerFirstName: "María",
  cycleStamps: 4,
  stampsRequired: 6,
  rewardName: null,
  walletToken: "wallet-token-xyz",
  colors: {
    backgroundRgb: [255, 255, 255],
    foregroundRgb: [0, 0, 0],
    labelRgb: [128, 128, 128],
  },
};

describe("buildPkpass — con firma FAKE (rápido, sin openssl)", () => {
  it("produce un zip válido con las 6 entradas esperadas (sin logo/strip, negocio sin branding real)", async () => {
    const pkpass = await buildPkpass({
      passJson: buildPassJson(passJsonInput),
      signer: createFakePkpassSigner(),
      iconRgb: [200, 50, 50],
    });

    const zip = new AdmZip(pkpass);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual([
      "icon.png",
      "icon@2x.png",
      "icon@3x.png",
      "manifest.json",
      "pass.json",
      "signature",
    ]);
  });

  it("con logoPng/stripPng, agrega las 6 entradas de imagen extra al zip y al manifest", async () => {
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const pkpass = await buildPkpass({
      passJson: buildPassJson(passJsonInput),
      signer: createFakePkpassSigner(),
      iconRgb: [200, 50, 50],
      logoPng: { at1x: onePixelPng, at2x: onePixelPng, at3x: onePixelPng },
      stripPng: { at1x: onePixelPng, at2x: onePixelPng, at3x: onePixelPng },
    });

    const zip = new AdmZip(pkpass);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual([
      "icon.png",
      "icon@2x.png",
      "icon@3x.png",
      "logo.png",
      "logo@2x.png",
      "logo@3x.png",
      "manifest.json",
      "pass.json",
      "signature",
      "strip.png",
      "strip@2x.png",
      "strip@3x.png",
    ]);

    const manifestEntry = zip.getEntry("manifest.json");
    const manifest = JSON.parse(manifestEntry!.getData().toString("utf8"));
    expect(Object.keys(manifest).sort()).toEqual(names.filter((n) => n !== "manifest.json" && n !== "signature").sort());
  });

  it("con iconPng, usa esos bytes en vez del cuadrado sólido de siempre (mismas 3 entradas, contenido real)", async () => {
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const pkpass = await buildPkpass({
      passJson: buildPassJson(passJsonInput),
      signer: createFakePkpassSigner(),
      iconRgb: [200, 50, 50],
      iconPng: { at1x: onePixelPng, at2x: onePixelPng, at3x: onePixelPng },
    });

    const zip = new AdmZip(pkpass);
    expect(zip.getEntry("icon.png")!.getData().equals(onePixelPng)).toBe(true);
    expect(zip.getEntry("icon@2x.png")!.getData().equals(onePixelPng)).toBe(true);
    expect(zip.getEntry("icon@3x.png")!.getData().equals(onePixelPng)).toBe(true);
  });

  it("pass.json dentro del zip es el mismo JSON que se le pasó", async () => {
    const passJson = buildPassJson(passJsonInput);
    const pkpass = await buildPkpass({
      passJson,
      signer: createFakePkpassSigner(),
      iconRgb: [200, 50, 50],
    });

    const zip = new AdmZip(pkpass);
    const entry = zip.getEntry("pass.json");
    expect(entry).not.toBeNull();
    expect(JSON.parse(entry!.getData().toString("utf8"))).toEqual(passJson);
  });

  it("manifest.json trae el SHA1 correcto de cada archivo (no un hash inventado)", async () => {
    const pkpass = await buildPkpass({
      passJson: buildPassJson(passJsonInput),
      signer: createFakePkpassSigner(),
      iconRgb: [10, 10, 10],
    });

    const zip = new AdmZip(pkpass);
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf8")) as Record<
      string,
      string
    >;
    const passJsonBytes = zip.getEntry("pass.json")!.getData();
    const expectedSha1 = createHash("sha1").update(passJsonBytes).digest("hex");

    expect(manifest["pass.json"]).toBe(expectedSha1);
  });

  it("el signer recibe EXACTAMENTE los mismos bytes que terminan en manifest.json dentro del zip", async () => {
    let receivedManifest: Buffer | null = null;
    const spySigner: PkpassSigner = async (manifestJson) => {
      receivedManifest = manifestJson;
      return Buffer.from("fake-sig");
    };

    const pkpass = await buildPkpass({
      passJson: buildPassJson(passJsonInput),
      signer: spySigner,
      iconRgb: [1, 2, 3],
    });

    const zip = new AdmZip(pkpass);
    const manifestInZip = zip.getEntry("manifest.json")!.getData();

    expect(receivedManifest).not.toBeNull();
    expect(receivedManifest!.equals(manifestInZip)).toBe(true);
  });
});

describe("buildPkpass — con firma REAL (node-forge + cert autofirmado)", () => {
  let cert: FakeAppleCertBundle;

  beforeAll(() => {
    cert = generateFakeAppleCertBundle();
  });

  it("produce una firma PKCS#7 estructuralmente válida, con la cadena de certificados completa", async () => {
    const pkpass = await buildPkpass({
      passJson: buildPassJson(passJsonInput),
      signer: createRealPkpassSigner(cert),
      iconRgb: [30, 144, 255],
    });

    const zip = new AdmZip(pkpass);
    const signatureBytes = zip.getEntry("signature")!.getData();

    const asn1 = forge.asn1.fromDer(signatureBytes.toString("binary"));
    const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData;
    expect(p7.certificates).toHaveLength(2);
  });
});
