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

describe("buildPassJson — contenido mínimo, sin PII de más", () => {
  it("el progreso de sellos vive en headerFields, no en primaryFields — nombre de pila en secondaryFields", () => {
    const pass = buildPassJson(baseInput) as {
      storeCard: { primaryFields: unknown[]; secondaryFields: Array<{ value: string }> };
    };

    expect(pass.storeCard.secondaryFields[0].value).toBe("María");
  });

  it("primaryFields queda SIEMPRE vacío — PassKit lo superpone sobre el strip en storeCard, sin control de posición, y con el hero compuesto tapaba el logo en un dispositivo real (bug encontrado post-deploy, ver comentario en passJson.ts)", () => {
    const pass = buildPassJson(baseInput) as { storeCard: { primaryFields: unknown[] } };
    expect(pass.storeCard.primaryFields).toEqual([]);
  });

  it("headerFields lleva 'SELLOS X/Y' siempre visible (vista apilada de Wallet), un solo campo", () => {
    const pass = buildPassJson(baseInput) as {
      storeCard: { headerFields: Array<{ key: string; label: string; value: string }> };
    };
    expect(pass.storeCard.headerFields).toEqual([
      { key: "stampsHeader", label: "SELLOS", value: "4/6" },
    ]);
  });

  // Bug real corregido: el campo es cycleStamps (progreso del CICLO
  // actual, ya acotado por cycleStampProgress en @loyalty/core), nunca el
  // total acumulado crudo — mostrar el total ("8/6") junto a un grid que
  // solo puede representar un ciclo (strip-N.png) se leía inconsistente
  // (confirmado con un render real). Caso de Carlo: 8 sellos crudos,
  // límite 6 → cycleStamps ya viene calculado en 2 antes de llegar acá.
  it("caso real de Carlo (8 sellos crudos, límite 6): con cycleStamps=2 ya calculado, el header dice '2/6', no '8/6'", () => {
    const pass = buildPassJson({ ...baseInput, cycleStamps: 2, stampsRequired: 6 }) as {
      storeCard: { headerFields: Array<{ value: string }> };
    };
    expect(pass.storeCard.headerFields[0].value).toBe("2/6");
  });

  it("sin availableRewardsCount (o con 1), secondaryFields NO agrega 'Recompensas disponibles' — sería redundante con auxiliaryFields.reward", () => {
    const passNoCount = buildPassJson(baseInput) as { storeCard: { secondaryFields: Array<{ key: string }> } };
    expect(passNoCount.storeCard.secondaryFields.map((f) => f.key)).not.toContain("rewardsAvailable");

    const passOne = buildPassJson({ ...baseInput, availableRewardsCount: 1 }) as {
      storeCard: { secondaryFields: Array<{ key: string }> };
    };
    expect(passOne.storeCard.secondaryFields.map((f) => f.key)).not.toContain("rewardsAvailable");
  });

  it("con availableRewardsCount > 1, secondaryFields SÍ agrega el conteo — ahí sí aporta información nueva", () => {
    const pass = buildPassJson({ ...baseInput, availableRewardsCount: 3 }) as {
      storeCard: { secondaryFields: Array<{ key: string; label: string; value: string }> };
    };
    expect(pass.storeCard.secondaryFields).toContainEqual({
      key: "rewardsAvailable",
      label: "Recompensas disponibles",
      value: "3",
    });
  });

  it("el barcode lleva EXACTAMENTE el wallet_token opaco, formato QR — nunca datos del cliente codificados ahí", () => {
    const pass = buildPassJson(baseInput) as {
      barcodes: Array<{ message: string; format: string }>;
    };

    expect(pass.barcodes[0].message).toBe("wallet-token-xyz");
    expect(pass.barcodes[0].format).toBe("PKBarcodeFormatQR");
    expect(pass.barcodes[0].message).not.toContain("María");
  });

  it("'Powered by Pragmia' vive SIEMPRE en backFields, incondicional — el estado de recompensa puede persistir indefinidamente (acumulación), no hay un momento 'libre' confiable al frente", () => {
    const pass = buildPassJson(baseInput) as { storeCard: { backFields: unknown[] } };
    expect(pass.storeCard.backFields).toEqual([{ key: "poweredBy", label: "", value: "Powered by Pragmia" }]);
  });

  it("sin recompensa disponible, auxiliaryFields queda vacío — ya no lleva poweredBy de respaldo", () => {
    const pass = buildPassJson(baseInput) as { storeCard: { auxiliaryFields: unknown[] } };
    expect(pass.storeCard.auxiliaryFields).toEqual([]);
  });

  it("con recompensa disponible, aparece en auxiliaryFields", () => {
    const pass = buildPassJson({ ...baseInput, rewardName: "Café gratis" }) as {
      storeCard: { auxiliaryFields: Array<{ value: string }> };
    };
    expect(pass.storeCard.auxiliaryFields[0].value).toBe("Café gratis");
  });

  it("con recompensa disponible, auxiliaryFields lleva SOLO la recompensa (sin competir por espacio) y backFields sigue teniendo poweredBy de todos modos", () => {
    const pass = buildPassJson({ ...baseInput, rewardName: "Orden de chilaquiles gratis" }) as {
      storeCard: { auxiliaryFields: Array<{ key: string }>; backFields: Array<{ value: string }> };
    };
    expect(pass.storeCard.auxiliaryFields.map((f) => f.key)).toEqual(["reward"]);
    expect(pass.storeCard.backFields).toEqual([{ key: "poweredBy", label: "", value: "Powered by Pragmia" }]);
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
