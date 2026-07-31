import type { RgbColor } from "../apple/placeholderIcon";

// Construye los payloads de Loyalty Class (por negocio) y Loyalty Object
// (por cliente) — puro, sin I/O, mismo espíritu que apple/passJson.ts:
// contenido MÍNIMO, nunca teléfono/email/apellido. El barcode lleva el
// mismo wallet_token opaco que Apple. classId/objectId se DERIVAN
// determinísticamente del issuerId+businessId/customerId (ver skill
// wallet-integration) — no se guardan en el esquema.
//
// reviewStatus="underReview" es intencional (no un placeholder olvidado):
// es el estado que Google exige mientras la cuenta no tiene aprobación de
// publicación (ver docs/WALLET-SETUP.md, "GOOGLE PUBLISHING") — con eso,
// los pases solo funcionan en modo demo marcados "[TEST ONLY]". Cambiarlo
// a "underReviewIssuer"/aprobado es un trámite externo, no un cambio de
// código.

export function buildLoyaltyClassId(issuerId: string, businessId: string): string {
  return `${issuerId}.biz_${businessId}`;
}

export function buildLoyaltyObjectId(issuerId: string, customerId: string): string {
  return `${issuerId}.pass_${customerId}`;
}

function toHex([r, g, b]: RgbColor): string {
  const channel = (n: number) => n.toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export type LoyaltyClassInput = {
  issuerId: string;
  businessId: string;
  businessName: string;
  programName: string;
  backgroundRgb: RgbColor;
};

export function buildLoyaltyClassPayload(input: LoyaltyClassInput): Record<string, unknown> {
  return {
    id: buildLoyaltyClassId(input.issuerId, input.businessId),
    issuerName: input.businessName,
    programName: input.programName,
    reviewStatus: "underReview",
    hexBackgroundColor: toHex(input.backgroundRgb),
  };
}

export type LoyaltyObjectInput = {
  issuerId: string;
  businessId: string;
  customerId: string;
  customerFirstName: string | null;
  currentStamps: number;
  stampsRequired: number;
  rewardName: string | null;
  walletToken: string;
};

export function buildLoyaltyObjectPayload(input: LoyaltyObjectInput): Record<string, unknown> {
  const textModulesData = input.rewardName
    ? [{ header: "Recompensa disponible", body: input.rewardName }]
    : [];

  return {
    id: buildLoyaltyObjectId(input.issuerId, input.customerId),
    classId: buildLoyaltyClassId(input.issuerId, input.businessId),
    state: "active",
    ...(input.customerFirstName ? { accountName: input.customerFirstName } : {}),
    loyaltyPoints: {
      label: "Sellos",
      balance: { string: `${input.currentStamps} / ${input.stampsRequired}` },
    },
    textModulesData,
    barcode: { type: "QR_CODE", value: input.walletToken },
  };
}
