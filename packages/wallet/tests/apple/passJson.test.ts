import { describe, expect, it } from "vitest";
import { buildPassJson, buildRelevantText, type PassJsonInput } from "../../src/apple/passJson";

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

  it("sin nombre de cliente (null), secondaryFields queda con SOLO el slot de poweredBy/rewardsAvailable — nunca 'undefined' ni vacío del todo", () => {
    const pass = buildPassJson({ ...baseInput, customerFirstName: null }) as {
      storeCard: { secondaryFields: Array<{ key: string }> };
    };
    expect(pass.storeCard.secondaryFields).toEqual([
      { key: "poweredBySecondary", label: "", value: "Powered by Pragmia" },
    ]);
  });

  it("'Powered by Pragmia' vive en secondaryFields (cara del pase) cuando no hay 2+ recompensas — pedido explícito de que vuelva a verse al frente", () => {
    // key DISTINTO al de backFields ("poweredBy") a propósito — Apple exige
    // keys únicos en TODO el pase, no solo dentro de cada grupo de campos
    // (bug real encontrado vía POST /v1/log de un dispositivo real).
    const passNoCount = buildPassJson(baseInput) as { storeCard: { secondaryFields: Array<{ key: string; value: string }> } };
    expect(passNoCount.storeCard.secondaryFields).toContainEqual({
      key: "poweredBySecondary",
      label: "",
      value: "Powered by Pragmia",
    });

    const passOne = buildPassJson({ ...baseInput, availableRewardsCount: 1 }) as {
      storeCard: { secondaryFields: Array<{ key: string }> };
    };
    expect(passOne.storeCard.secondaryFields.map((f) => f.key)).toContain("poweredBySecondary");
  });

  it("con 2+ recompensas disponibles, 'Recompensas disponibles' TOMA el slot de poweredBy en secondaryFields (no conviven)", () => {
    const pass = buildPassJson({ ...baseInput, availableRewardsCount: 2 }) as {
      storeCard: { secondaryFields: Array<{ key: string }> };
    };
    expect(pass.storeCard.secondaryFields.map((f) => f.key)).not.toContain("poweredBySecondary");
    expect(pass.storeCard.secondaryFields.map((f) => f.key)).toContain("rewardsAvailable");
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

  it("sin locations, el pase no lleva ese campo (nunca un array vacío fantasma)", () => {
    const pass = buildPassJson(baseInput);
    expect(pass).not.toHaveProperty("locations");
    expect(pass).not.toHaveProperty("maxDistance");
  });

  it("con locations, se pasan tal cual (relevantText ya calculado por el caller) + maxDistance si se manda", () => {
    const pass = buildPassJson({
      ...baseInput,
      locations: [{ latitude: 19.1738, longitude: -96.1342, relevantText: "¡Te faltan 2 sellos!" }],
      maxDistance: 150,
    }) as { locations: Array<{ latitude: number; relevantText: string }>; maxDistance: number };
    expect(pass.locations).toHaveLength(1);
    expect(pass.locations[0].latitude).toBe(19.1738);
    expect(pass.locations[0].relevantText).toBe("¡Te faltan 2 sellos!");
    expect(pass.maxDistance).toBe(150);
  });

  it("con locations pero sin maxDistance, no manda ese campo (deja que Apple use su radio implícito)", () => {
    const pass = buildPassJson({
      ...baseInput,
      locations: [{ latitude: 19.1738, longitude: -96.1342 }],
    });
    expect(pass).not.toHaveProperty("maxDistance");
  });

  it("sin howItWorksText/howToEarnStampText/reviewLinkUrl/validUntilText, backFields no agrega esas entradas (negocio sin config, ej. Iriz Style)", () => {
    const pass = buildPassJson(baseInput) as { storeCard: { backFields: Array<{ key: string }> } };
    expect(pass.storeCard.backFields.map((f) => f.key)).toEqual(["poweredBy"]);
  });

  it("con las 4 entradas de contenido estático (Chilaquikes), backFields agrega las 4 en orden, después de poweredBy/promo", () => {
    const pass = buildPassJson({
      ...baseInput,
      howItWorksText: "6 sellos → orden gratis de chilaquiles",
      howToEarnStampText: "Por cada visita y compra en cualquiera de nuestras sucursales, ganas un sello.",
      reviewLinkUrl: "https://maps.app.goo.gl/QnLLo5F2h8p1Wwhf8",
      reviewLinkLabel: "Dejar reseña en Google",
      validUntilText: "Ilimitado",
    }) as {
      storeCard: {
        backFields: Array<{ key: string; label: string; value: string; attributedValue?: string }>;
      };
    };
    expect(pass.storeCard.backFields.map((f) => f.key)).toEqual([
      "poweredBy",
      "howItWorks",
      "howToEarnStamp",
      "review",
      "validUntil",
    ]);
    expect(pass.storeCard.backFields.find((f) => f.key === "howItWorks")?.value).toBe(
      "6 sellos → orden gratis de chilaquiles",
    );
    expect(pass.storeCard.backFields.find((f) => f.key === "validUntil")?.value).toBe("Ilimitado");
  });

  it("el link de reseña lleva attributedValue tappable (HTML <a href>) con value en texto plano como respaldo", () => {
    const pass = buildPassJson({
      ...baseInput,
      reviewLinkUrl: "https://maps.app.goo.gl/QnLLo5F2h8p1Wwhf8",
      reviewLinkLabel: "Dejar reseña en Google",
    }) as { storeCard: { backFields: Array<{ key: string; value: string; attributedValue?: string }> } };
    const review = pass.storeCard.backFields.find((f) => f.key === "review");
    expect(review?.value).toBe("Dejar reseña en Google");
    expect(review?.attributedValue).toBe(
      "<a href='https://maps.app.goo.gl/QnLLo5F2h8p1Wwhf8'>Dejar reseña en Google</a>",
    );
  });

  it("reviewLinkUrl sin reviewLinkLabel usa 'Dejar reseña' como texto de respaldo", () => {
    const pass = buildPassJson({
      ...baseInput,
      reviewLinkUrl: "https://maps.app.goo.gl/QnLLo5F2h8p1Wwhf8",
    }) as { storeCard: { backFields: Array<{ key: string; value: string }> } };
    expect(pass.storeCard.backFields.find((f) => f.key === "review")?.value).toBe("Dejar reseña");
  });
});

describe("buildRelevantText — mismo tono/casos que buildProgressMessage de Google, duplicado a propósito", () => {
  it("con sellos pendientes (2+), dice cuántos faltan", () => {
    expect(buildRelevantText(4, 6, "Orden de chilaquiles gratis")).toBe(
      "¡Te faltan 2 sellos para tu Orden de chilaquiles gratis!",
    );
  });

  it("con exactamente 1 sello restante, usa singular", () => {
    expect(buildRelevantText(5, 6, "Orden de chilaquiles gratis")).toBe(
      "¡Solo te falta 1 sello para tu Orden de chilaquiles gratis!",
    );
  });

  it("con el ciclo completo, cambia a mensaje de canje listo", () => {
    expect(buildRelevantText(6, 6, "Café gratis")).toBe("¡Ya puedes canjear tu Café gratis!");
  });

  it("con nombre de cliente, lo antepone en minúscula tras la coma (mismo cuerpo del mensaje)", () => {
    expect(buildRelevantText(4, 6, "Orden de chilaquiles gratis", "Carlo")).toBe(
      "¡Carlo, te faltan 2 sellos para tu Orden de chilaquiles gratis!",
    );
    expect(buildRelevantText(6, 6, "Café gratis", "Carlo")).toBe("¡Carlo, ya puedes canjear tu Café gratis!");
  });

  it("sin nombre (null o undefined), usa el texto genérico de siempre — nunca 'null,' ni placeholder", () => {
    expect(buildRelevantText(4, 6, "Orden de chilaquiles gratis", null)).toBe(
      "¡Te faltan 2 sellos para tu Orden de chilaquiles gratis!",
    );
    expect(buildRelevantText(4, 6, "Orden de chilaquiles gratis")).toBe(
      "¡Te faltan 2 sellos para tu Orden de chilaquiles gratis!",
    );
  });
});
