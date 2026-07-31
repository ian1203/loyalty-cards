import { describe, expect, it } from "vitest";
import {
  buildLoyaltyClassId,
  buildLoyaltyClassPayload,
  buildLoyaltyObjectId,
  buildLoyaltyObjectPayload,
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
});

describe("buildLoyaltyClassPayload — plantilla por negocio, sin datos de cliente", () => {
  it("el id coincide con buildLoyaltyClassId", () => {
    const cls = buildLoyaltyClassPayload(classInput) as { id: string };
    expect(cls.id).toBe(buildLoyaltyClassId(classInput.issuerId, classInput.businessId));
  });

  it("reviewStatus queda en 'underReview' (estado esperado sin aprobación de publicación)", () => {
    const cls = buildLoyaltyClassPayload(classInput) as { reviewStatus: string };
    expect(cls.reviewStatus).toBe("underReview");
  });

  it("el color se serializa en hex", () => {
    const cls = buildLoyaltyClassPayload(classInput) as { hexBackgroundColor: string };
    expect(cls.hexBackgroundColor).toBe("#ff0000");
  });

  it("nunca incluye datos de un cliente — es la plantilla del negocio", () => {
    const cls = buildLoyaltyClassPayload(classInput);
    expect(JSON.stringify(cls)).not.toContain("María");
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

  it("el progreso de sellos va en loyaltyPoints.balance.string", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as {
      loyaltyPoints: { balance: { string: string } };
    };
    expect(obj.loyaltyPoints.balance.string).toBe("4 / 6");
  });

  it("sin recompensa disponible, textModulesData queda vacío", () => {
    const obj = buildLoyaltyObjectPayload(objectInput) as { textModulesData: unknown[] };
    expect(obj.textModulesData).toEqual([]);
  });

  it("con recompensa disponible, aparece en textModulesData", () => {
    const obj = buildLoyaltyObjectPayload({ ...objectInput, rewardName: "Café gratis" }) as {
      textModulesData: Array<{ header: string; body: string }>;
    };
    expect(obj.textModulesData[0].body).toBe("Café gratis");
  });

  it("sin nombre de cliente (null), no incluye accountName — nunca 'undefined' ni placeholder", () => {
    const obj = buildLoyaltyObjectPayload({ ...objectInput, customerFirstName: null });
    expect(obj).not.toHaveProperty("accountName");
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
