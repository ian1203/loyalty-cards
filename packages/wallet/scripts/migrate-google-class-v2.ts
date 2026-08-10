// Migra los Loyalty Object de Google Wallet de CHILAQUIKES (los 4 clientes
// reales que ya tienen un pase de Google guardado) al classId _v2 — la
// clase nueva sin heroImage (Sección B de la ronda "tres frentes":
// quitar la foto de producto, agregar "Powered by Pragmia"). Regla no
// negociable de la tarea: clase NUEVA con classId NUEVO, nunca un PATCH
// in-place de la clase vieja (Google cachea agresivamente por classId) —
// y esta migración NO borra la clase vieja, solo deja de ser la que los
// clientes ven.
//
// Datos de negocio/programa/clientes fuente: consultados a mano vía
// `supabase db query --linked` (misma vía ya usada en esta ronda para
// leer/limpiar producción — DATABASE_URL de producción no es legible
// localmente) y transcritos acá como constantes. Este script NO toca la
// DB — solo llama a la API real de Google Wallet. Las credenciales reales
// salen de apps/web/.env.local (misma cuenta emisora que ya usa
// create-chilaquikes-production-class.ts).
//
// classId/objectId se DERIVAN (ver loyaltyPayload.ts), nunca se guardan
// en el esquema — por eso "migrar" es simplemente: 1) crear la clase _v2
// (upsertLoyaltyClass), 2) volver a mandar el MISMO objectId de cada
// cliente (buildLoyaltyObjectId ya es determinístico por customerId) pero
// con classId apuntando a _v2 (upsertLoyaltyObject hace PATCH porque el
// objeto ya existe) — el pase que el cliente YA guardó en su teléfono se
// actualiza solo, sin que vuelva a tocar "Agregar a Wallet".
//
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/migrate-google-class-v2.ts
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
    `[migrate-v2] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
      "Revisa WALLET_GOOGLE_ISSUER_ID y WALLET_GOOGLE_SERVICE_ACCOUNT_JSON en apps/web/.env.local.",
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

// businesses (slug='chilaquikes') — leído por SQL, ver comentario arriba.
const BUSINESS_ID = "26166780-c160-4e91-81a5-a0694a96cecc";
const BUSINESS_NAME = "CHILAQUIKES";
const BRAND_COLOR_HEX = "#DB0A00";
const PROGRAM_LOGO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786000242/chilaquikes-logo-pass_da7axu.png";
const WIDE_PROGRAM_LOGO_URI: string | undefined = undefined; // no existe todavía — pendiente de Narciso, ver CLAUDE.md

// loyalty_programs (business_id=BUSINESS_ID) — leído por SQL.
const PROGRAM_NAME = "Tarjeta de sellos Chilaquikes";
const STAMPS_REQUIRED = 6;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// customers + customer_balances (business_id=BUSINESS_ID, platform='google')
// — leído por SQL, mismos 4 clientes reales confirmados en esta ronda
// (los otros wallet_passes(platform='google') eran artefactos de prueba
// propios, ya borrados).
const CUSTOMERS: Array<{ customerId: string; fullName: string; walletToken: string; currentStamps: number }> = [
  { customerId: "16759788-d8af-4a3a-8d62-975bb27ee38d", fullName: "Carlo Aburto", walletToken: "RWrbTe3bYXoJQew9VmMNoPFM2-ZMpg_o", currentStamps: 1 },
  { customerId: "62e672f8-5765-4fa0-baee-404d4d064a0c", fullName: "Gerardo Aburto", walletToken: "z5zsDJEI6R4cq9Nxb2zuKehe2zXZsFx9", currentStamps: 2 },
  { customerId: "7f9bf0fd-ab38-495f-8820-757bb69fbc89", fullName: "Ian Vicente", walletToken: "gydoyACaWIEriiD5Vd_t1sEvNtEwlvsm", currentStamps: 0 },
  { customerId: "2bfa4066-5ee6-4886-bd5c-0e80e1515215", fullName: "Narciso Vicente", walletToken: "F3t4_Kwn1H6r90AMTT-dg4S_RAT9eKn9", currentStamps: 0 },
];

// reward_rules activas (business_id=BUSINESS_ID, is_active=true), ya
// ordenadas por stamps_required ascendente — leído por SQL. Ninguno de
// los 4 clientes reales llegó a 6 sellos todavía, así que rewardName
// (desbloqueada) sale null para los cuatro con esta lista — se deja la
// regla completa igual (replica availableRewards de @loyalty/core) para
// que el script siga siendo correcto si se re-corre más adelante con
// balances distintos.
const ACTIVE_REWARD_RULES: Array<{ name: string; stampsRequired: number }> = [
  { name: "Orden de chilaquiles gratis", stampsRequired: 6 },
];

function resolveUnlockedRewardName(currentStamps: number): string | null {
  return ACTIVE_REWARD_RULES.find((rule) => rule.stampsRequired <= currentStamps)?.name ?? null;
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
    // heroImageUri: deliberadamente omitido — el motivo entero de _v2.
    classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
  });

  console.log(`[migrate-v2] Creando la clase nueva: ${classPayload.id}`);
  await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
  console.log("[migrate-v2] Clase _v2 lista (sin heroImage).");

  const oldClassId = buildLoyaltyClassId(issuerId, BUSINESS_ID);
  console.log(`[migrate-v2] Clase vieja (${oldClassId}) queda intacta — no se borra.`);

  for (const customer of CUSTOMERS) {
    const objectPayload = buildLoyaltyObjectPayload({
      issuerId,
      businessId: BUSINESS_ID,
      customerId: customer.customerId,
      customerFirstName: customer.fullName.split(" ")[0],
      currentStamps: customer.currentStamps,
      stampsRequired: STAMPS_REQUIRED,
      rewardName: resolveUnlockedRewardName(customer.currentStamps),
      walletToken: customer.walletToken,
      classVersion: CURRENT_GOOGLE_LOYALTY_CLASS_VERSION,
    });

    const objectId = buildLoyaltyObjectId(issuerId, customer.customerId);
    console.log(`[migrate-v2] Migrando ${customer.fullName} (${objectId}) → ${objectPayload.classId}`);
    await client.upsertLoyaltyObject(objectId, objectPayload);
  }

  console.log(`\n[migrate-v2] Listo — ${CUSTOMERS.length} clientes reales migrados a ${classPayload.id}.`);
}

main().catch((error) => {
  console.error("[migrate-v2] Falló:", error);
  process.exit(1);
});
