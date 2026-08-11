// Migra los Loyalty Object de Google Wallet de CHILAQUIKES (los clientes
// reales que ya tienen un pase de Google guardado) al classId _v7 — reduce
// merchantLocations de 3 ubicaciones a SOLO la sede fija (Local, Av.
// Cristóbal Colón). Motivo: sin control server-side de frecuencia (ver
// _v6/passGeneration.ts — ni Apple ni Google avisan a nuestro servidor
// cuando el geofence dispara, y el aviso persiste mientras el dispositivo
// esté dentro del radio, no una vez al día), el cliente decidió que el
// aviso persistente solo tiene sentido para la sede fija — las 2
// sucursales móviles (foodtruck Torrente, foodtruck Calasanz) se quitan.
// Mismo cambio aplicado del lado de la DB: locations.latitude/longitude
// de esas 2 filas se pusieron en NULL — Apple (passGeneration.ts) lo
// recoge automático en la siguiente generación (query dinámica, sin
// classId que cachear); Google SÍ necesita este bump porque
// merchantLocations vive en la Loyalty Class, cacheada por Google
// agresivamente por classId. Regla no negociable de la tarea: clase NUEVA
// con classId NUEVO, nunca un PATCH in-place de la clase vieja — esta
// migración NO borra la clase _v6, solo deja de ser la que los clientes ven.
//
// packages/wallet es un paquete aislado a propósito (sin Next.js/DB, ver
// CLAUDE.md) — no puede importar @loyalty/db, así que, igual que
// migrate-google-class-v6.ts, este script NO consulta la base de datos.
// Los datos de negocio/programa/clientes de abajo son un snapshot manual:
// ANTES DE CORRER, refresca los currentStamps reales con:
//
//   supabase db query --linked "select c.id as customer_id, c.full_name, \
//     c.wallet_token, cb.current_stamps \
//     from customers c \
//     join customer_balances cb on cb.customer_id = c.id \
//     join wallet_passes wp on wp.customer_id = c.id and wp.platform = 'google' \
//     where c.business_id = '26166780-c160-4e91-81a5-a0694a96cecc'"
//
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/migrate-google-class-v7.ts
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
    `[migrate-v7] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
      "Revisa WALLET_GOOGLE_ISSUER_ID y WALLET_GOOGLE_SERVICE_ACCOUNT_JSON en apps/web/.env.local.",
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

const BUSINESS_ID = "26166780-c160-4e91-81a5-a0694a96cecc";
const BUSINESS_NAME = "CHILAQUIKES";
const BRAND_COLOR_HEX = "#DB0A00";
const PROGRAM_LOGO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786000242/chilaquikes-logo-pass_da7axu.png";
const WIDE_PROGRAM_LOGO_URI: string | undefined = undefined;
const HERO_IMAGE_URI = "https://www.pragmia-data.com/passes/chilaquikes/hero-v3.jpg";
const PROGRAM_NAME = "Club de la Gorrita";
const STAMPS_REQUIRED = 6;

// SOLO la sede fija — coordenada confirmada, locations.latitude/longitude
// en la DB real (id=4f8f0146-2e77-475a-82ad-55b4c611a6ca, business_id=
// BUSINESS_ID). Los 2 foodtrucks se quitaron a propósito (ver comentario
// de arriba) — sus filas en locations siguen existiendo, solo con
// latitude/longitude en NULL.
const MERCHANT_LOCATIONS = [{ latitude: 19.175369, longitude: -96.1212448 }]; // Local (Av. Cristóbal Colón)

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// customers + customer_balances + wallet_passes(platform='google') —
// REFRESCADO vía `supabase db query --linked` justo antes de escribir esto
// (2026-08-11), idéntico al snapshot de _v6 (nadie selló entre medio).
const CUSTOMERS: Array<{ customerId: string; fullName: string; walletToken: string; currentStamps: number }> = [
  { customerId: "62e672f8-5765-4fa0-baee-404d4d064a0c", fullName: "Gerardo Aburto", walletToken: "z5zsDJEI6R4cq9Nxb2zuKehe2zXZsFx9", currentStamps: 2 },
  { customerId: "54deda8b-7d08-40ed-9ed8-7040bd5bcce4", fullName: "Ian Vicente", walletToken: "vtqczDqns0XirW2Vl8K1Phf5yZhmfjOo", currentStamps: 0 },
  { customerId: "2348ae73-8d42-45f4-ad61-7979fe4efb7b", fullName: "Juan Perez", walletToken: "lDm0vnVNLC-wIWW6d2ZjNXrRal87e48V", currentStamps: 2 },
  { customerId: "9f2014f7-3e2b-41d7-b47d-faca1b0ba319", fullName: "Carlos Aburto", walletToken: "_deAspvVOMcGdjgPaD_yz_FwuCAHjUba", currentStamps: 5 },
  { customerId: "d61cecee-c199-42e8-873c-ebf7d00d1b8e", fullName: "Carlo Aburto", walletToken: "-HBw9GYGO16XbxfuTrYdYzb8orV49qwg", currentStamps: 2 },
  { customerId: "2d261f72-42a7-4845-892a-ca69d52b0fea", fullName: "francisco manuel", walletToken: "iSsZp7qqyOcrEY0_vtFsfO8vezUL2OmU", currentStamps: 1 },
  { customerId: "7927c4e9-7489-4cc3-93de-fa96982d2e67", fullName: "Alessandra Rosas Carmona", walletToken: "wlJY_0PmavW0AfZaiWqLhfK-1d8BtF88", currentStamps: 0 },
];

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
    merchantLocations: MERCHANT_LOCATIONS,
    classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
  });

  console.log(`[migrate-v7] Creando la clase nueva: ${classPayload.id}`);
  await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
  console.log(`[migrate-v7] Clase _v7 lista (merchantLocations reducido a ${MERCHANT_LOCATIONS.length} ubicación).`);

  const oldClassId = buildLoyaltyClassId(issuerId, BUSINESS_ID, "v6");
  console.log(`[migrate-v7] Clase vieja (${oldClassId}) queda intacta — no se borra.`);

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
    console.log(`[migrate-v7] Migrando ${customer.fullName} (${objectId}) → ${objectPayload.classId}`);
    await client.upsertLoyaltyObject(objectId, objectPayload);
  }

  console.log(`\n[migrate-v7] Listo — ${CUSTOMERS.length} clientes reales migrados a ${classPayload.id}.`);
}

main().catch((error) => {
  console.error("[migrate-v7] Falló:", error);
  process.exit(1);
});
