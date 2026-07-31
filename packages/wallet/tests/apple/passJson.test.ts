import { describe, expect, it } from "vitest";
import { buildPassJson, type PassJsonInput } from "../../src/apple/passJson";

const baseInput: PassJsonInput = {
  serialNumber: "11111111-1111-1111-1111-111111111111",
  authenticationToken: "auth-token-abc",
  webServiceUrl: "https://example.com/api/wallet/apple",
  passTypeIdentifier: "pass.dev.loyalty",
  teamIdentifier: "TEAM123",
  organizationName: "Cafetería Test",
  programName: "Tarjeta de sellos",
  customerFirstName: "María",
  currentStamps: 4,
  stampsRequired: 6,
  rewardName: null,
  walletToken: "wallet-token-xyz",
  colors: {
    backgroundRgb: [255, 255, 255],
    foregroundRgb: [0, 0, 0],
    labelRgb: [128, 128, 128],
  },
};

describe("buildPassJson — contenido mínimo, sin PII de más", () => {
  it("incluye el progreso de sellos y el nombre de pila", () => {
    const pass = buildPassJson(baseInput) as {
      storeCard: { primaryFields: Array<{ value: string }>; secondaryFields: Array<{ value: string }> };
    };

    expect(pass.storeCard.primaryFields[0].value).toBe("4 de 6");
    expect(pass.storeCard.secondaryFields[0].value).toBe("María");
  });

  it("el barcode lleva EXACTAMENTE el wallet_token opaco, formato QR — nunca datos del cliente codificados ahí", () => {
    const pass = buildPassJson(baseInput) as {
      barcodes: Array<{ message: string; format: string }>;
    };

    expect(pass.barcodes[0].message).toBe("wallet-token-xyz");
    expect(pass.barcodes[0].format).toBe("PKBarcodeFormatQR");
    expect(pass.barcodes[0].message).not.toContain("María");
  });

  it("sin recompensa disponible, auxiliaryFields queda vacío (no un placeholder falso)", () => {
    const pass = buildPassJson(baseInput) as { storeCard: { auxiliaryFields: unknown[] } };
    expect(pass.storeCard.auxiliaryFields).toEqual([]);
  });

  it("con recompensa disponible, aparece en auxiliaryFields", () => {
    const pass = buildPassJson({ ...baseInput, rewardName: "Café gratis" }) as {
      storeCard: { auxiliaryFields: Array<{ value: string }> };
    };
    expect(pass.storeCard.auxiliaryFields[0].value).toBe("Café gratis");
  });

  it("sin nombre de cliente (null), secondaryFields queda vacío — nunca 'undefined' ni placeholder", () => {
    const pass = buildPassJson({ ...baseInput, customerFirstName: null }) as {
      storeCard: { secondaryFields: unknown[] };
    };
    expect(pass.storeCard.secondaryFields).toEqual([]);
  });

  it("nunca incluye email — PassJsonInput ni siquiera acepta teléfono/email como campo (garantía de tipo)", () => {
    const pass = buildPassJson(baseInput);
    expect(JSON.stringify(pass)).not.toMatch(/@/); // ningún email
  });

  it("lleva authenticationToken y webServiceURL para que Apple pueda llamar al web service", () => {
    const pass = buildPassJson(baseInput) as {
      authenticationToken: string;
      webServiceURL: string;
    };
    expect(pass.authenticationToken).toBe("auth-token-abc");
    expect(pass.webServiceURL).toBe("https://example.com/api/wallet/apple");
  });

  it("los colores se serializan como rgb(...)", () => {
    const pass = buildPassJson(baseInput) as { backgroundColor: string };
    expect(pass.backgroundColor).toBe("rgb(255, 255, 255)");
  });
});
