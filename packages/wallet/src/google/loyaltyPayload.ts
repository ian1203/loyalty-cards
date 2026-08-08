import type { RgbColor } from "../apple/placeholderIcon";

// Construye los payloads de Loyalty Class (por negocio) y Loyalty Object
// (por cliente) — puro, sin I/O, mismo espíritu que apple/passJson.ts:
// contenido MÍNIMO, nunca teléfono/email/apellido. El barcode lleva el
// mismo wallet_token opaco que Apple. classId/objectId se DERIVAN
// determinísticamente del issuerId+businessId/customerId (ver skill
// wallet-integration) — no se guardan en el esquema.

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

function imageAsset(uri: string, description: string): Record<string, unknown> {
  return {
    sourceUri: { uri },
    contentDescription: { defaultValue: { language: "es-MX", value: description } },
  };
}

export type LoyaltyClassInput = {
  issuerId: string;
  businessId: string;
  businessName: string;
  programName: string;
  backgroundRgb: RgbColor;
  // URLs públicas HTTPS — Google Wallet las va a buscar por su cuenta al
  // renderizar la clase, no acepta un archivo local ni un data-URI.
  // Opcionales: sin ellas, la clase queda sin esa pieza (nunca un
  // placeholder fantasma que confunda con los sellos).
  programLogoUri?: string;
  // Variante ancha del logo (banner en vez de ícono circular) — solo vale
  // la pena mandarla si existe un asset realmente diseñado para ese
  // formato; Google la estira si le das el mismo logo cuadrado que
  // programLogo, y se ve peor que no mandar nada.
  wideProgramLogoUri?: string;
  // Imagen grande en la parte superior de la tarjeta — el único lugar del
  // diseño de Google Wallet con espacio para una foto real del producto
  // (Google no soporta una rejilla gráfica de sellos, a diferencia de
  // Apple Wallet).
  heroImageUri?: string;
};

export function buildLoyaltyClassPayload(input: LoyaltyClassInput): Record<string, unknown> {
  return {
    id: buildLoyaltyClassId(input.issuerId, input.businessId),
    issuerName: input.businessName,
    programName: input.programName,
    // "UNDER_REVIEW" (SCREAMING_SNAKE_CASE — verificado contra la API
    // real: un POST con "APPROVED" lo rechaza con 400, "Invalid review
    // status \"APPROVED\". Use \"UNDER_REVIEW\" instead" — el issuer NO
    // puede autodeclararse aprobado vía este campo; ese valor lo pone
    // Google después de su propia revisión, nunca el emisor). El código
    // anterior tenía "underReview" en camelCase, que nunca se validó
    // contra la API real (solo se probó vía el link "Add to Wallet",
    // que embebe la clase en el JWT sin pasar por esta validación
    // estricta) — la marca "[TEST ONLY]" no depende de este campo: la
    // controla el estatus de aprobación de PUBLICACIÓN de la cuenta
    // emisora (trámite externo, ver docs/WALLET-SETUP.md), no algo que
    // este payload declare.
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: toHex(input.backgroundRgb),
    ...(input.programLogoUri
      ? { programLogo: imageAsset(input.programLogoUri, `Logo de ${input.businessName}`) }
      : {}),
    ...(input.wideProgramLogoUri
      ? { wideProgramLogo: imageAsset(input.wideProgramLogoUri, `Logo de ${input.businessName}`) }
      : {}),
    ...(input.heroImageUri
      ? { heroImage: imageAsset(input.heroImageUri, input.businessName) }
      : {}),
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

// Google Wallet no soporta una rejilla gráfica de sellos (a diferencia de
// Apple Wallet) — el ÚNICO lugar para comunicar avance es texto. Un
// "4 / 6" seco en loyaltyPoints.balance no motiva a volver; este mensaje
// vive aparte, en textModulesData, con el nombre real de la recompensa y
// cuánto falta (o la confirmación de que ya está lista).
export function buildProgressMessage(
  currentStamps: number,
  stampsRequired: number,
  rewardName: string,
): string {
  const remaining = Math.max(stampsRequired - currentStamps, 0);
  if (remaining === 0) {
    return `¡Ya puedes canjear tu ${rewardName}!`;
  }
  return `${currentStamps} de ${stampsRequired} sellos — ¡a ${remaining} de tu ${rewardName}!`;
}

export function buildLoyaltyObjectPayload(input: LoyaltyObjectInput): Record<string, unknown> {
  const textModulesData = input.rewardName
    ? [
        {
          header: "Tu progreso",
          body: buildProgressMessage(input.currentStamps, input.stampsRequired, input.rewardName),
        },
      ]
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
