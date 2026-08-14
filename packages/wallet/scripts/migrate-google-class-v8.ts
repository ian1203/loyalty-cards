// Migra los Loyalty Object de Google Wallet de CHILAQUIKES (los clientes
// reales que ya tienen un pase de Google guardado) al classId _v8 —
// cardRowTemplateInfos pasa de oneItem (solo accountName) a twoItems
// (accountName + conteo de sellos), pedido explícito de Iriz Style
// aplicado a todo negocio con Google Wallet activo (ver
// packages/wallet/src/google/loyaltyPayload.ts). Ningún otro campo cambia
// respecto a _v7 — mismo brand color, logo, hero, merchantLocations,
// programa y recompensa.
//
// packages/wallet es un paquete aislado a propósito (sin Next.js/DB, ver
// CLAUDE.md) — no puede importar @loyalty/db, así que, igual que
// migrate-google-class-v7.ts, este script NO consulta la base de datos.
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
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/migrate-google-class-v8.ts
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
    `[migrate-v8] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
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
const STAMPS_REQUIRED = 8; // real en producción — confirmado contra loyalty_programs, no el 6 hardcodeado en v7

// SOLO la sede fija — sin cambio respecto a _v7 (ver ese script para el
// porqué).
const MERCHANT_LOCATIONS = [{ latitude: 19.175369, longitude: -96.1212448 }]; // Local (Av. Cristóbal Colón)

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// customers + customer_balances + wallet_passes(platform='google') —
// REFRESCADO vía `supabase db query --linked` justo antes de escribir esto
// (2026-08-14).
const CUSTOMERS: Array<{ customerId: string; fullName: string; walletToken: string; currentStamps: number }> = [
  { customerId: "62e672f8-5765-4fa0-baee-404d4d064a0c", fullName: "Gerardo Aburto", walletToken: "z5zsDJEI6R4cq9Nxb2zuKehe2zXZsFx9", currentStamps: 0 },
  { customerId: "730b33f6-505f-4d8b-ac40-6ec170dab0d2", fullName: "Dafne Triana", walletToken: "go6Z-CThWLs3KZzdME6_dgyvtk5vDP-R", currentStamps: 2 },
  { customerId: "7a52e01b-e12e-4232-95be-a871be84e172", fullName: "Hania Armenta", walletToken: "4JL0x4vje-jELlVttiYDlFBn0CpW-Mgi", currentStamps: 0 },
  { customerId: "7927c4e9-7489-4cc3-93de-fa96982d2e67", fullName: "Alessandra Rosas Carmona", walletToken: "wlJY_0PmavW0AfZaiWqLhfK-1d8BtF88", currentStamps: 0 },
  { customerId: "f2654f06-b92c-4d70-bfd3-18d3a9367dce", fullName: "Iker santiago Vazquez", walletToken: "llz0C5ZtG_q_h4h-dwA7Bym8t-Ac27vj", currentStamps: 0 },
  { customerId: "1830fc6c-a666-4318-b22a-b41638634520", fullName: "Carlos Vazquez", walletToken: "iGy0DIHzVCiJD3mLIiyLN7aeU_SptIV1", currentStamps: 0 },
  { customerId: "2ebd4389-3ebe-4bab-b134-9cef71d45716", fullName: "Regina Navarrete", walletToken: "hodHPRLvAzTWcz9emHLLIjDJ2qKUmt6G", currentStamps: 0 },
  { customerId: "d3f3a947-809a-41fb-8007-f68f91a4d083", fullName: "Oscar Giovanni Severino Santiago", walletToken: "lEJpNPfHNoQ8KHqoOohTBR44sH4aSP2T", currentStamps: 0 },
  { customerId: "b360763a-c41a-4902-95d9-2892fe79f11c", fullName: "Brian Boo", walletToken: "wF322Cxf-sbPB0fQVoNRtsZfCLFX-tFl", currentStamps: 0 },
  { customerId: "3156626f-eadf-40b9-96dc-209692e14e30", fullName: "Valentina Gerardo", walletToken: "DkRGvD-soWKQ6intoMYxZYzpx576Ibd8", currentStamps: 0 },
  { customerId: "23d13f57-cc76-465a-bd3a-05825dd097a7", fullName: "César pro Don chingon", walletToken: "E-5uks2JOov8687BH4728UwlPd9ywMjZ", currentStamps: 0 },
  { customerId: "28fcdc43-7d60-4d99-8fc2-38f2a7873f2a", fullName: "nicol venancio", walletToken: "zRJLiF5yEvLYKtmzpIKyNbLyEKYGa6sB", currentStamps: 0 },
  { customerId: "8338f389-2956-4936-83f5-95f75204c359", fullName: "Alondra Prieto", walletToken: "8Eun3XVS71EYM3za4W5lRwODpHwzscsd", currentStamps: 1 },
  { customerId: "407f8140-225a-4861-beed-682dcf4af083", fullName: "Ian Vicente", walletToken: "_0pS4a_w_8PFkUBpMiVAz9PWgIBDn_iJ", currentStamps: 0 },
  { customerId: "4fe5e940-d066-492b-9c7d-1051cd70d987", fullName: "Juan pablo Burguer boiler", walletToken: "WHR8aBrVBEYLJGYGHbFOxtpFj4k-WRao", currentStamps: 1 },
  { customerId: "a0066e07-6bd7-4693-a022-ab841cd925f2", fullName: "Oscar Burger boiler", walletToken: "x0bBNtV82dS12xy7b8i5QJnqBY_u0zF2", currentStamps: 1 },
  { customerId: "ed8e09a0-0ad5-4272-974c-6ff36086e00c", fullName: "Yesenia Alejandra Nava Barrera", walletToken: "gcmtvEoZoc1IunC9YvL0IrhrdS_nhXIr", currentStamps: 1 },
  { customerId: "d5745929-5674-43fc-aee4-fe5ecc1f6bb7", fullName: "César Belarmino Moreno Gutiérrez", walletToken: "Rxt7Kx0mbFsnHOoboq8D0Bu0CChjolep", currentStamps: 0 },
  { customerId: "5b3884b2-b5cb-4468-962a-a66eff520c8c", fullName: "José Alberto Toledo arroniz", walletToken: "3JjNgYIVNpQvnou1d3YPpIkb-GfQ43KT", currentStamps: 1 },
  { customerId: "6e85504a-c4c8-43b4-99ab-c789057ceebb", fullName: "jess garcía", walletToken: "e7S8Fe2Hk5_clporL7KuPWA2STAsPm94", currentStamps: 1 },
  { customerId: "a987191b-a978-46e0-ba16-5e074cff17b7", fullName: "Andrea Layna", walletToken: "wprsgaptEJIWpkB11yyfGa1KQ6SwCOie", currentStamps: 1 },
  { customerId: "c95a0d6d-63d4-49a0-bc9b-a0b4d343e728", fullName: "Hanna ailyn Uscanga", walletToken: "vgGrjxqkwpryy4tfAzYoEeNvamMPnXT8", currentStamps: 0 },
  { customerId: "66525cd4-1cb6-4c87-842e-612649cba978", fullName: "Diana Pérez", walletToken: "GGRkT23D5VeYI-GmRG8GozDJbeoOZUfz", currentStamps: 0 },
  { customerId: "c0f9e654-a978-4133-8224-f91f9836f422", fullName: "Lorena Roman", walletToken: "KB-FFCHviS7crHVJXyeZi4dvUSeoWiQ9", currentStamps: 0 },
  { customerId: "ab7d979c-97ec-47ea-a8c6-bdc622e3d363", fullName: "Michelle Amaya Ortiz", walletToken: "hIOPQwlBK31GUpjvWzoz_a9TO7GmyBEy", currentStamps: 0 },
  { customerId: "b6de7ec4-e56f-4e71-8e49-e9111d88b93b", fullName: "Edzna Soto", walletToken: "Ghwz96VNmRowo96XwJvjCA-f2Q7eQxvH", currentStamps: 1 },
  { customerId: "583d8554-07b2-4299-ab2b-80329c8c9e47", fullName: "José Manuel Richaud", walletToken: "Cw_6WveqTiGqDiDf4NQYYANUZaUhUh2i", currentStamps: 0 },
  { customerId: "04d36d5e-bf6e-4c50-b0ec-18f5513755da", fullName: "Michell Garcia portela", walletToken: "PlqxzEYuOtaxq3x7IYAkHIU0i_MTULHJ", currentStamps: 0 },
  { customerId: "50bb6f33-3092-4b5a-94f7-6d7ebbc61bf3", fullName: "Yoel Herrera Villegas", walletToken: "-8D62iCJ_LxGEOwfhvgeMFpMuzsaHfgr", currentStamps: 1 },
  { customerId: "da11856c-4956-4d79-b44f-ccedc610dd68", fullName: "Vanessa Gómez", walletToken: "AZ_bDGK2MWWNCZtLORdcwuVCfrn06O0L", currentStamps: 2 },
  { customerId: "ea798f88-33da-4dd3-8419-842229449ca0", fullName: "Bernardo Vélez", walletToken: "0PijAs3S-MgkCpgJF_i9ZUfquWaZwf_h", currentStamps: 0 },
  { customerId: "8fa8256a-c2b9-43f8-a60f-605e33d18bf2", fullName: "Abrahan de Jesús Galindo Méndez", walletToken: "hCUHjDI6yOKbY5aENhpa23eOfuIJkuot", currentStamps: 0 },
  { customerId: "8ca33f50-e053-4926-9585-62304d8b0652", fullName: "Alberto Garcia scott", walletToken: "y3mt9RFKS_2SEOxlTZiWOHc9uRrwogL-", currentStamps: 0 },
  { customerId: "f171ec45-7f59-46f4-999f-dae9c6b9142d", fullName: "José Domingo Cruz Mirón", walletToken: "Jc5voe4DmNmiKpbxUh_xbsli4hJFE-hx", currentStamps: 1 },
  { customerId: "072b2d15-e676-4b66-9869-a3f1e0e5cde0", fullName: "Francisco Tiburcio", walletToken: "Y-QXeYMW7GzxC9kVmPp5EznudgfsNIeh", currentStamps: 1 },
  { customerId: "de3c8056-d5e7-4522-b8b1-dc342b0aed65", fullName: "Rosita Amaro", walletToken: "NO3ckmnqDpKwdW2DZ7JFrJxWao7oY3uN", currentStamps: 0 },
  { customerId: "0e357fb8-0885-4eed-9e51-b1ccb366de4f", fullName: "Melissa Zamora Gamboa", walletToken: "63t4pZKBnDN96_QVEPgzEvFzdRIqPe9X", currentStamps: 0 },
  { customerId: "064f56d0-f9e5-46ae-8304-88accbf0edcf", fullName: "Ricardo Morales", walletToken: "XPP2rvW7oQ8vThH8CV8QY1CsDhz8FqYp", currentStamps: 0 },
];

const ACTIVE_REWARD_RULES: Array<{ name: string; stampsRequired: number }> = [
  { name: "Orden de chilaquiles gratis", stampsRequired: 8 },
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

  console.log(`[migrate-v8] Creando la clase nueva: ${classPayload.id}`);
  await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
  console.log(`[migrate-v8] Clase _v8 lista (twoItems: accountName + conteo de sellos).`);

  const oldClassId = buildLoyaltyClassId(issuerId, BUSINESS_ID, "v7");
  console.log(`[migrate-v8] Clase vieja (${oldClassId}) queda intacta — no se borra.`);

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
    console.log(`[migrate-v8] Migrando ${customer.fullName} (${objectId}) → ${objectPayload.classId}`);
    await client.upsertLoyaltyObject(objectId, objectPayload);
  }

  console.log(`\n[migrate-v8] Listo — ${CUSTOMERS.length} clientes reales migrados a ${classPayload.id}.`);
}

main().catch((error) => {
  console.error("[migrate-v8] Falló:", error);
  process.exit(1);
});
