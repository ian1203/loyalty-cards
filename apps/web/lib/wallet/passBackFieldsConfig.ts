// Contenido informativo ESTÁTICO por negocio para el reverso del pase
// (Apple backFields) y sus equivalentes en Google Wallet (textModulesData +
// linksModuleData) — nivel OBJETO en ambos casos (ver
// packages/wallet/src/{apple/passJson,google/loyaltyPayload}.ts), así que
// agregar/editar una entrada acá NUNCA exige un classId nuevo de Google.
//
// Config en código, keyed por business_id (decisión explícita: sin config
// nueva en `businesses`, evita una migración de esquema para lo que hoy es
// contenido de UN solo negocio — ver el mismo criterio ya usado para
// CURRENT_GOOGLE_LOYALTY_CLASS_VERSION). Un negocio sin entrada acá no
// agrega ningún campo nuevo al pase — comportamiento idéntico al de antes
// de este archivo (Iriz Style, y cualquier alta futura, quedan sin tocar).
export type PassBackFieldsConfig = {
  howItWorksText: string;
  howToEarnStampText: string;
  validUntilText: string;
  reviewLinkUrl: string;
  reviewLinkLabel: string;
  createdWithUrl: string;
  createdWithLabel: string;
  // Activa 3 backFields dinámicos MÁS (total histórico de sellos,
  // faltantes para la próxima recompensa, recompensas disponibles) —
  // separado de los campos estáticos de arriba porque estos SÍ exigen una
  // query nueva por cliente (ver loyaltySnapshot.ts) en vez de un texto
  // fijo, así que solo corre para negocios que la activen explícitamente.
  showAccountSummaryFields: boolean;
};

const CHILAQUIKES_BUSINESS_ID = "26166780-c160-4e91-81a5-a0694a96cecc";
// Tenant sandbox para probar "sello = logo del negocio" (packages/wallet/
// scripts/generate-pass-assets.ts, modo --stamp-logo) antes de tocar
// producción de Chilaquikes — branding clonado de Iriz Style + sucursal de
// prueba propia (ver docs/HISTORY.md). Contenido de placeholder: copia
// literal del de Chilaquikes, sin significado real para este negocio.
const WALLET_VERIFY_TEST_BUSINESS_ID = "71b80bf7-10cc-4d98-a980-88eef530775b";

const CONFIG_BY_BUSINESS_ID: Record<string, PassBackFieldsConfig> = {
  [CHILAQUIKES_BUSINESS_ID]: {
    howItWorksText: "8 sellos → orden gratis de chilaquiles",
    howToEarnStampText:
      "Por cada visita y compra en cualquiera de nuestras sucursales (local + 2 foodtrucks), ganas un sello.",
    validUntilText: "Ilimitado",
    reviewLinkUrl: "https://maps.app.goo.gl/QnLLo5F2h8p1Wwhf8",
    reviewLinkLabel: "Dejar reseña en Google",
    createdWithUrl: "https://pragmia-data.com",
    createdWithLabel: "Pragmia",
    showAccountSummaryFields: true,
  },
  [WALLET_VERIFY_TEST_BUSINESS_ID]: {
    howItWorksText: "8 sellos → orden gratis de chilaquiles",
    howToEarnStampText:
      "Por cada visita y compra en cualquiera de nuestras sucursales (local + 2 foodtrucks), ganas un sello.",
    validUntilText: "Ilimitado",
    reviewLinkUrl: "https://maps.app.goo.gl/QnLLo5F2h8p1Wwhf8",
    reviewLinkLabel: "Dejar reseña en Google",
    createdWithUrl: "https://pragmia-data.com",
    createdWithLabel: "Pragmia",
    showAccountSummaryFields: true,
  },
};

export function getPassBackFieldsConfig(businessId: string): PassBackFieldsConfig | null {
  return CONFIG_BY_BUSINESS_ID[businessId] ?? null;
}
