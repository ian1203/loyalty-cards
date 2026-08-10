import { describe, expect, it } from "vitest";
import {
  buildLoyaltyClassId,
  buildLoyaltyClassPayload,
  buildLoyaltyObjectId,
  buildLoyaltyObjectPayload,
  buildProgressMessage,
  type LoyaltyClassInput,
  type LoyaltyObjectInput,
} from "../../src/google/loyaltyPayload";

const classInput: LoyaltyClassInput = {
  issuerId: "3388000000012345678",
  businessId: "11111111-1111-1111-1111-111111111111",
  businessName: "Cafetería Test",
  programName: "Tarjeta de sellos",
  backgroundRgb: [255, 0, 0],
};

const objectInput: LoyaltyObjectInput = {
  issuerId: "3388000000012345678",
  businessId: "11111111-1111-1111-1111-111111111111",
  customerId: "22222222-2222-2222-2222-222222222222",
  customerFirstName: "María",
  currentStamps: 4,
  stampsRequired: 6,
  rewardName: null,
  walletToken: "wallet-token-xyz",
};

describe("buildLoyaltyClassId / buildLoyaltyObjectId — derivados, no guardados en el esquema", () => {
  it("el classId depende de issuerId+businessId, determinístico", () => {
    expect(buildLoyaltyClassId("issuer1", "biz1")).toBe("issuer1.biz_biz1");
    expect(buildLoyaltyClassId("issuer1", "biz1")).toBe(buildLoyaltyClassId("issuer1", "biz1"));
  });

  it("el objectId depende de issuerId+customerId, determinístico", () => {
    expect(buildLoyaltyObjectId("issuer1", "cust1")).toBe("issuer1.pass_cust1");
  });

  it("dos negocios distintos producen classId distintos", () => {
    expect(buildLoyaltyClassId("issuer1", "biz1")).not.toBe(buildLoyaltyClassId("issuer1", "biz2"));
  });

  it("con versión, agrega el sufijo — sin versión, el id sale igual que siempre (compatibilidad hacia atrás)", () => {
    expect(buildLoyaltyClassId("issuer1", "biz1", "v2")).toBe("issuer1.biz_biz1_v2");
    expect(buildLoyaltyClassId("issuer1", "biz1")).toBe("issuer1.biz_biz1");
  });
});

describe("buildLoyaltyClassPayload — plantilla por negocio, sin datos de cliente", () => {
  it("el id coincide con buildLoyaltyClassId", () => {
    const cls = buildLoyaltyClassPayload(classInput) as { id: string };
    expect(cls.id).toBe(buildLoyaltyClassId(classInput.issuerId, classInput.businessId));
  });

  it("reviewStatus queda en 'UNDER_REVIEW' (SCREAMING_SNAKE_CASE — el issuer no puede autodeclararse 'APPROVED' vía la API, confirmado contra Google real: 400 'Invalid review status')", () => {
    const cls = buildLoyaltyClassPayload(classInput) as { reviewStatus: string };
    expect(cls.reviewStatus).toBe("UNDER_REVIEW");
  });

  it("el color se serializa en hex", () => {
    const cls = buildLoyaltyClassPayload(classInput) as { hexBackgroundColor: string };
    expect(cls.hexBackgroundColor).toBe("#ff0000");
  });

  it("nunca incluye datos de un cliente — es la plantilla del negocio", () => {
    const cls = buildLoyaltyClassPayload(classInput);
    expect(JSON.stringify(cls)).not.toContain("María");
  });

  it("sin programLogoUri/wideProgramLogoUri/heroImageUri, no manda esos campos (nunca un placeholder fantasma)", () => {
    const cls = buildLoyaltyClassPayload(classInput);
    expect(cls).not.toHaveProperty("programLogo");
    expect(cls).not.toHaveProperty("wideProgramLogo");
    expect(cls).not.toHaveProperty("heroImage");
  });

  it("con las 3 URIs, arma los 3 campos de imagen con sourceUri + contentDescription", () => {
    const cls = buildLoyaltyClassPayload({
      ...classInput,
      programLogoUri: "https://example.com/logo.png",
      wideProgramLogoUri: "https://example.com/logo-wide.png",
      heroImageUri: "https://example.com/hero.jpg",
    }) as {
      programLogo: { sourceUri: { uri: string } };
      wideProgramLogo: { sourceUri: { uri: string } };
      heroImage: { sourceUri: { uri: string } };
    };
    expect(cls.programLogo.sourceUri.uri).toBe("https://example.com/logo.png");
    expect(cls.wideProgramLogo.sourceUri.uri).toBe("https://example.com/logo-wide.png");
    expect(cls.heroImage.sourceUri.uri).toBe("https://example.com/hero.jpg");
  });
});

describe("buildProgressMessage — texto motivador (Google Wallet no soporta rejilla gráfica de sellos)", () => {
  it("con sellos pendientes, dice cuántos faltan SIN repetir el conteo (ya lo muestra loyaltyPoints.balance)", () => {
    expect(buildProgressMessage(4, 6, "Orden de chilaquiles gratis")).toBe(
      "¡Te faltan 2 sellos para tu Orden de chilaquiles gratis!",
    );
  });

  it("con exactamente 1 sello restante, usa singular", () => {
    expect(buildProgressMessage(5, 6, "Orden de chilaquiles gratis")).toBe(
      "¡Solo te falta 1 sello para tu Orden de chilaquiles gratis!",
    );
  });

  it("con el total completo, cambia a mensaje de canje listo (no '0 de N')", () => {
    expect(buildProgressMessage(6, 6, "Café gratis")).toBe("¡Ya puedes canjear tu Café gratis!");
  });

  it("con excedente (canje ya arrastró sobrante, ver @loyalty/core), sigue en mensaje de canje listo", () => {
    expect(buildProgressMessage(8, 6, "Café gratis")).toBe("¡Ya puedes canjear tu Café gratis!");
  });
});

describe("buildLoyaltyObjectPayload — contenido mínimo por cliente, sin PII de más", () => {
  it("el id y classId coinciden con los derivados", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as { id: string; classId: string };
    expect(obj.id).toBe(buildLoyaltyObjectId(objectInput.issuerId, objectInput.customerId));
    expect(obj.classId).toBe(buildLoyaltyClassId(objectInput.issuerId, objectInput.businessId));
  });

  it("el barcode lleva EXACTAMENTE el wallet_token opaco, tipo QR", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as { barcode: { type: string; value: string } };
    expect(obj.barcode.type).toBe("QR_CODE");
    expect(obj.barcode.value).toBe("wallet-token-xyz");
  });

  it("el progreso de sellos va en loyaltyPoints.balance.string (conteo compacto, siempre presente)", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as {
      loyaltyPoints: { balance: { string: string } };
    };
    expect(obj.loyaltyPoints.balance.string).toBe("4 / 6");
  });

  it("sin recompensa disponible, textModulesData lleva solo 'Powered by Pragmia' (sin mensaje de progreso)", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as { textModulesData: Array<{ id: string; body: string }> };
    expect(obj.textModulesData).toEqual([{ id: "poweredBy", header: "", body: "Powered by Pragmia" }]);
  });

  it("con recompensa configurada, textModulesData lleva el mensaje motivador de buildProgressMessage además de 'Powered by Pragmia'", () => {
    const obj = buildLoyaltyObjectPayload({ ...objectInput, rewardName: "Café gratis" }) as {
      textModulesData: Array<{ id: string; header: string; body: string }>;
    };
    expect(obj.textModulesData[0].body).toBe(
      buildProgressMessage(objectInput.currentStamps, objectInput.stampsRequired, "Café gratis"),
    );
    expect(obj.textModulesData[1]).toEqual({ id: "poweredBy", header: "", body: "Powered by Pragmia" });
  });

  it("sin nombre de cliente (null), no incluye accountName — nunca 'undefined' ni placeholder", () => {
    const obj = buildLoyaltyObjectPayload({ ...objectInput, customerFirstName: null });
    expect(obj).not.toHaveProperty("accountName");
  });

  it("sin availableRewardsCount (o con 1), textModulesData NO agrega 'rewardsAvailable' — redundante con el mensaje de progreso/rewardName", () => {
    const objNoCount = buildLoyaltyObjectPayload(objectInput) as { textModulesData: Array<{ id: string }> };
    expect(objNoCount.textModulesData.map((m) => m.id)).not.toContain("rewardsAvailable");

    const objOne = buildLoyaltyObjectPayload({ ...objectInput, availableRewardsCount: 1 }) as {
      textModulesData: Array<{ id: string }>;
    };
    expect(objOne.textModulesData.map((m) => m.id)).not.toContain("rewardsAvailable");
  });

  it("con availableRewardsCount > 1, textModulesData SÍ agrega el conteo", () => {
    const obj = buildLoyaltyObjectPayload({ ...objectInput, availableRewardsCount: 2 }) as {
      textModulesData: Array<{ id: string; header: string; body: string }>;
    };
    expect(obj.textModulesData).toContainEqual({
      id: "rewardsAvailable",
      header: "Recompensas disponibles",
      body: "2",
    });
  });

  it("nunca incluye email/teléfono — el tipo de entrada ni siquiera los acepta", () => {
    const obj = buildLoyaltyObjectPayload(objectInput);
    expect(JSON.stringify(obj)).not.toMatch(/@/);
  });

  it("state queda en 'active'", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as { state: string };
    expect(obj.state).toBe("active");
  });
});
