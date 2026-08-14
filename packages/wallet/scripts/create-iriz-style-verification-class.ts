// Pase de VERIFICACIÓN de IRIZ STYLE contra los servidores reales de Google
// Wallet — mismo patrón que create-chilaquikes-production-class.ts.
// classId con businessId "iriz-style_verify", deliberadamente DISTINTO del
// que la app calcula para el negocio real (buildLoyaltyClassId con el UUID
// real) — esto es solo para previsualizar antes de tocar producción, nunca
// lo que un cliente real recibe.
//
// LOGO_URI/HERO_URI apuntan a un túnel cloudflared temporal (solo para esta
// verificación) — el flujo real (googleSaveLink.ts) lee
// businesses.google_logo_uri/google_hero_uri, que todavía no están
// actualizados a los nuevos assets.
//
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/create-iriz-style-verification-class.ts
import { randomBytes } from "node:crypto";
import { createRealGoogleWalletClient } from "../src/google/signer.ts";
import {
  buildLoyaltyClassId,
  buildLoyaltyClassPayload,
  buildLoyaltyObjectId,
  buildLoyaltyObjectPayload,
} from "../src/google/loyaltyPayload.ts";
import { resolveWalletConfig } from "../src/config.ts";

const config = resolveWalletConfig();

if (!config.google.credentials) {
  console.error(
    `[iriz-verify] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.`,
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

const VERIFY_BUSINESS_ID = "iriz-style_verify";
const VERIFY_CUSTOMER_ID = `verify-${randomBytes(6).toString("hex")}`;

const BRAND_RGB: [number, number, number] = [0x00, 0x00, 0x00];

const TUNNEL_BASE = process.argv[2];
if (!TUNNEL_BASE) {
  console.error("Uso: ...create-iriz-style-verification-class.ts <tunnel-base-url>");
  process.exit(1);
}
const LOGO_URI = `${TUNNEL_BASE}/logo.png`;
const HERO_URI = `${TUNNEL_BASE}/hero.png`;

const REWARD_NAME = "Recompensa por definir";
const STAMPS_REQUIRED = 10;
const DEMO_CURRENT_STAMPS = 4;

const classPayload = buildLoyaltyClassPayload({
  issuerId,
  businessId: VERIFY_BUSINESS_ID,
  businessName: "Iriz Style",
  programName: "Tarjeta de sellos",
  backgroundRgb: BRAND_RGB,
  programLogoUri: LOGO_URI,
  heroImageUri: HERO_URI,
});

console.log("[iriz-verify] Creando/actualizando la Loyalty Class de verificación en Google Wallet…");
await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
console.log(`[iriz-verify] Listo: ${classPayload.id}`);

const objectPayload = buildLoyaltyObjectPayload({
  issuerId,
  businessId: VERIFY_BUSINESS_ID,
  customerId: VERIFY_CUSTOMER_ID,
  customerFirstName: "Verificación",
  cycleStamps: DEMO_CURRENT_STAMPS,
  stampsRequired: STAMPS_REQUIRED,
  rewardName: REWARD_NAME,
  walletToken: `verify_${randomBytes(12).toString("hex")}`,
});

const saveLink = await client.buildSaveLink({
  loyaltyClasses: [classPayload],
  loyaltyObjects: [objectPayload],
});

console.log("\n=== Pase de VERIFICACIÓN — IRIZ STYLE ===");
console.log(`Class ID:     ${classPayload.id}`);
console.log(`reviewStatus: ${(classPayload as { reviewStatus: string }).reviewStatus}`);
console.log(`Progreso:     ${DEMO_CURRENT_STAMPS} / ${STAMPS_REQUIRED} sellos`);
console.log(`Color:        #000000`);
console.log(`Logo:         ${LOGO_URI}`);
console.log(`Hero:         ${HERO_URI}`);
console.log("\nLink:\n");
console.log(saveLink);
