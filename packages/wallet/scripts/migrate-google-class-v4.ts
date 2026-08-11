// Migra los Loyalty Object de Google Wallet de CHILAQUIKES (los clientes
// reales que ya tienen un pase de Google guardado) al classId _v4 — la
// clase nueva con classTemplateInfo.cardTemplateOverride, que saca
// accountName (el nombre del cliente) a la CARA visible de la tarjeta en
// vez de dejarlo solo en el panel de detalles (ver loyaltyPayload.ts para
// el porqué y la cita de la documentación de Google). Regla no negociable
// de la tarea: clase NUEVA con classId NUEVO, nunca un PATCH in-place de
// la clase vieja (Google cachea agresivamente por classId) — y esta
// migración NO borra la clase _v3, solo deja de ser la que los clientes ven.
//
// packages/wallet es un paquete aislado a propósito (sin Next.js/DB, ver
// CLAUDE.md) — no puede importar @loyalty/db, así que, igual que
// migrate-google-class-v3.ts, este script NO consulta la base de datos.
// Los datos de negocio/programa/clientes de abajo son un snapshot manual:
// ANTES DE CORRER, refresca los currentStamps reales (han pasado horas/días
// desde que se transcribieron por última vez) con:
//
//   supabase db query --linked "select c.id as customer_id, c.full_name, \
//     c.wallet_token, cb.current_stamps \
//     from customers c \
//     join customer_balances cb on cb.customer_id = c.id \
//     join wallet_passes wp on wp.customer_id = c.id and wp.platform = 'google' \
//     where c.business_id = '26166780-c160-4e91-81a5-a0694a96cecc'"
//
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/migrate-google-class-v4.ts
import { createRealGoogleWalletClient } from "../src/google/signer.ts";
import {
  buildLoyaltyClassId,
  buildLoyaltyClassPayload,
  buildLoyaltyObjectId,
  buildLoyaltyObjectPayload,
  CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
} from "../src/google/loyaltyPayload.ts";
import { resolveWalletConfig } from "../src/config.ts";

const config = resolveWalletConfig();
if (!config.google.credentials) {
  console.error(
    `[migrate-v4] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
      "Revisa WALLET_GOOGLE_ISSUER_ID y WALLET_GOOGLE_SERVICE_ACCOUNT_JSON en apps/web/.env.local.",
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

// businesses (slug='chilaquikes') — mismos valores que migrate-google-class-v3.ts.
const BUSINESS_ID = "26166780-c160-4e91-81a5-a0694a96cecc";
const BUSINESS_NAME = "CHILAQUIKES";
const BRAND_COLOR_HEX = "#DB0A00";
const PROGRAM_LOGO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786000242/chilaquikes-logo-pass_da7axu.png";
const WIDE_PROGRAM_LOGO_URI: string | undefined = undefined; // sigue sin existir — ver comentario en googleSaveLink.ts sobre por qué logo-wordmark.png NO sirve para este campo
const HERO_IMAGE_URI = "https://www.pragmia-data.com/passes/chilaquikes/hero-v3.jpg";

const PROGRAM_NAME = "Tarjeta de sellos Chilaquikes";
const STAMPS_REQUIRED = 6;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// customers + customer_balances + wallet_passes(platform='google') —
// REFRESCADO vía `supabase db query --linked` justo antes de escribir esto
// (2026-08-11): 6 clientes con fila de wallet_passes(platform='google') —
// francisco manuel se agregó desde la migración _v3. Si vuelves a correr
// este script más tarde, refresca de nuevo — este snapshot vence rápido.
const CUSTOMERS: Array<{ customerId: string; fullName: string; walletToken: string; currentStamps: number }> = [
  { customerId: "62e672f8-5765-4fa0-baee-404d4d064a0c", fullName: "Gerardo Aburto", walletToken: "z5zsDJEI6R4cq9Nxb2zuKehe2zXZsFx9", currentStamps: 2 },
  { customerId: "54deda8b-7d08-40ed-9ed8-7040bd5bcce4", fullName: "Ian Vicente", walletToken: "vtqczDqns0XirW2Vl8K1Phf5yZhmfjOo", currentStamps: 0 },
  { customerId: "2348ae73-8d42-45f4-ad61-7979fe4efb7b", fullName: "Juan Perez", walletToken: "lDm0vnVNLC-wIWW6d2ZjNXrRal87e48V", currentStamps: 2 },
  { customerId: "9f2014f7-3e2b-41d7-b47d-faca1b0ba319", fullName: "Carlos Aburto", walletToken: "_deAspvVOMcGdjgPaD_yz_FwuCAHjUba", currentStamps: 3 },
  { customerId: "d61cecee-c199-42e8-873c-ebf7d00d1b8e", fullName: "Carlo Aburto", walletToken: "-HBw9GYGO16XbxfuTrYdYzb8orV49qwg", currentStamps: 2 },
  { customerId: "2d261f72-42a7-4845-892a-ca69d52b0fea", fullName: "francisco manuel", walletToken: "iSsZp7qqyOcrEY0_vtFsfO8vezUL2OmU", currentStamps: 1 },
];

// reward_rules activas — mismo criterio que v3 (replica availableRewards
// de @loyalty/core a mano, ver ese script para el porqué).
const ACTIVE_REWARD_RULES: Array<{ name: string; stampsRequired: number }> = [
  { name: "Orden de chilaquiles gratis", stampsRequired: 6 },
];

function resolveNextRewardName(): string | null {
  return ACTIVE_REWARD_RULES[0]?.name ?? null;
}

function resolveAvailableRewardsCount(currentStamps: number): number {
  return ACTIVE_REWARD_RULES.reduce((sum, rule) => sum + Math.floor(currentStamps / rule.stampsRequired), 0);
}

function resolveCycleStamps(currentStamps: number, stampsRequired: number): number {
  const remainder = currentStamps % stampsRequired;
  return remainder === 0 && currentStamps > 0 ? stampsRequired : remainder;
}

async function main() {
  const classPayload = buildLoyaltyClassPayload({
    issuerId,
    businessId: BUSINESS_ID,
    businessName: BUSINESS_NAME,
    programName: PROGRAM_NAME,
    backgroundRgb: hexToRgb(BRAND_COLOR_HEX),
    programLogoUri: PROGRAM_LOGO_URI,
    wideProgramLogoUri: WIDE_PROGRAM_LOGO_URI,
    heroImageUri: HERO_IMAGE_URI,
    classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
  });

  console.log(`[migrate-v4] Creando la clase nueva: ${classPayload.id}`);
  await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
  console.log("[migrate-v4] Clase _v4 lista (con classTemplateInfo → accountName en la cara).");

  const oldClassId = buildLoyaltyClassId(issuerId, BUSINESS_ID, "v3");
  console.log(`[migrate-v4] Clase vieja (${oldClassId}) queda intacta — no se borra.`);

  for (const customer of CUSTOMERS) {
    const objectPayload = buildLoyaltyObjectPayload({
      issuerId,
      businessId: BUSINESS_ID,
      customerId: customer.customerId,
      customerFirstName: customer.fullName.split(" ")[0],
      stampsRequired: STAMPS_REQUIRED,
      cycleStamps: resolveCycleStamps(customer.currentStamps, STAMPS_REQUIRED),
      rewardName: resolveNextRewardName(),
      availableRewardsCount: resolveAvailableRewardsCount(customer.currentStamps),
      walletToken: customer.walletToken,
      classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
    });

    const objectId = buildLoyaltyObjectId(issuerId, customer.customerId);
    console.log(`[migrate-v4] Migrando ${customer.fullName} (${objectId}) → ${objectPayload.classId}`);
    await client.upsertLoyaltyObject(objectId, objectPayload);
  }

  console.log(`\n[migrate-v4] Listo — ${CUSTOMERS.length} clientes reales migrados a ${classPayload.id}.`);
}

main().catch((error) => {
  console.error("[migrate-v4] Falló:", error);
  process.exit(1);
});
