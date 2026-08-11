// Migra los Loyalty Object de Google Wallet de CHILAQUIKES (los clientes
// reales que ya tienen un pase de Google guardado) al classId _v3 — la
// clase nueva CON heroImage (el patrón de mini-mascots, no la foto de
// producto que _v2 quitó). Regla no negociable de la tarea: clase NUEVA
// con classId NUEVO, nunca un PATCH in-place de la clase vieja (Google
// cachea agresivamente por classId) — y esta migración NO borra la clase
// _v2, solo deja de ser la que los clientes ven.
//
// packages/wallet es un paquete aislado a propósito (sin Next.js/DB, ver
// CLAUDE.md) — no puede importar @loyalty/db, así que, igual que
// migrate-google-class-v2.ts, este script NO consulta la base de datos.
// Los datos de negocio/programa/clientes de abajo son un snapshot manual:
// ANTES DE CORRER, refresca los currentStamps reales (han pasado semanas
// desde que se transcribieron por última vez) con:
//
//   supabase db query --linked "select c.id as customer_id, c.full_name, \
//     c.wallet_token, cb.current_stamps \
//     from customers c \
//     join customer_balances cb on cb.customer_id = c.id \
//     join wallet_passes wp on wp.customer_id = c.id and wp.platform = 'google' \
//     where c.business_id = '26166780-c160-4e91-81a5-a0694a96cecc'"
//
// Antes de correr esto también hace falta:
//   1. Confirmar que apps/web/public/passes/chilaquikes/hero-v3.jpg está
//      deployado (URL pública real, no localhost).
//   2. UPDATE businesses SET google_hero_uri = '<esa URL>' WHERE slug =
//      'chilaquikes' — para que el flujo normal (googleSaveLink.ts, altas
//      nuevas) también lo recoja. Este script NO hace ese UPDATE (no toca
//      la DB en absoluto, ver arriba) — es un paso manual aparte.
//
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/migrate-google-class-v3.ts
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
    `[migrate-v3] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
      "Revisa WALLET_GOOGLE_ISSUER_ID y WALLET_GOOGLE_SERVICE_ACCOUNT_JSON en apps/web/.env.local.",
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

// businesses (slug='chilaquikes') — mismos valores que migrate-google-class-v2.ts.
const BUSINESS_ID = "26166780-c160-4e91-81a5-a0694a96cecc";
const BUSINESS_NAME = "CHILAQUIKES";
const BRAND_COLOR_HEX = "#DB0A00";
const PROGRAM_LOGO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786000242/chilaquikes-logo-pass_da7axu.png";
const WIDE_PROGRAM_LOGO_URI: string | undefined = undefined; // sigue sin existir — ver comentario en googleSaveLink.ts sobre por qué logo-wordmark.png NO sirve para este campo
// Confirmado con curl -I real (no asumido): 200, content-type: image/jpeg,
// última verificación 2026-08-11.
const HERO_IMAGE_URI = "https://www.pragmia-data.com/passes/chilaquikes/hero-v3.jpg";

const PROGRAM_NAME = "Tarjeta de sellos Chilaquikes";
const STAMPS_REQUIRED = 6;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// customers + customer_balances + wallet_passes(platform='google') —
// REFRESCADO vía `supabase db query --linked` justo antes de escribir esto
// (2026-08-11) — el snapshot anterior (Gerardo + Ian solamente) ya estaba
// desactualizado: ahora hay 5 clientes con fila de wallet_passes(platform=
// 'google') — Juan Perez y Carlos/Carlo Aburto se agregaron desde
// entonces (probablemente al pedir el link de Google en algún momento de
// las pruebas). Si vuelves a correr este script más tarde, refresca de
// nuevo — este snapshot vence rápido.
const CUSTOMERS: Array<{ customerId: string; fullName: string; walletToken: string; currentStamps: number }> = [
  { customerId: "62e672f8-5765-4fa0-baee-404d4d064a0c", fullName: "Gerardo Aburto", walletToken: "z5zsDJEI6R4cq9Nxb2zuKehe2zXZsFx9", currentStamps: 2 },
  { customerId: "54deda8b-7d08-40ed-9ed8-7040bd5bcce4", fullName: "Ian Vicente", walletToken: "vtqczDqns0XirW2Vl8K1Phf5yZhmfjOo", currentStamps: 0 },
  { customerId: "2348ae73-8d42-45f4-ad61-7979fe4efb7b", fullName: "Juan Perez", walletToken: "lDm0vnVNLC-wIWW6d2ZjNXrRal87e48V", currentStamps: 2 },
  { customerId: "9f2014f7-3e2b-41d7-b47d-faca1b0ba319", fullName: "Carlos Aburto", walletToken: "_deAspvVOMcGdjgPaD_yz_FwuCAHjUba", currentStamps: 3 },
  { customerId: "d61cecee-c199-42e8-873c-ebf7d00d1b8e", fullName: "Carlo Aburto", walletToken: "-HBw9GYGO16XbxfuTrYdYzb8orV49qwg", currentStamps: 2 },
];

// reward_rules activas — mismo criterio que v2 (replica availableRewards
// de @loyalty/core a mano, ver ese script para el porqué).
const ACTIVE_REWARD_RULES: Array<{ name: string; stampsRequired: number }> = [
  { name: "Orden de chilaquiles gratis", stampsRequired: 6 },
];

function resolveNextRewardName(): string | null {
  // nextRewardName (no "la desbloqueada") — mismo criterio que
  // googleSaveLink.ts/notify.ts: Google necesita el mensaje motivador
  // desde antes de desbloquear, ver buildProgressMessage.
  return ACTIVE_REWARD_RULES[0]?.name ?? null;
}

// Replica countAvailableRedemptions de @loyalty/core a mano (packages/wallet
// no puede importar @loyalty/core, aislado a propósito) — canjes REALES
// posibles, floor(currentStamps/costo) sumado por regla activa. NO
// ACTIVE_REWARD_RULES.filter(...).length (esa era la implementación vieja,
// contaba reglas DISTINTAS desbloqueadas, nunca más de 1 por regla sin
// importar cuánto excediera el balance su costo — corregido en la sesión
// que agregó cycleStamps/countAvailableRedemptions, ver loyalty.ts).
function resolveAvailableRewardsCount(currentStamps: number): number {
  return ACTIVE_REWARD_RULES.reduce((sum, rule) => sum + Math.floor(currentStamps / rule.stampsRequired), 0);
}

// Replica cycleStampProgress de @loyalty/core a mano, mismo motivo que
// arriba — progreso del ciclo ACTUAL, con el caso especial de que un
// múltiplo exacto del requisito es CICLO COMPLETO, no 0 vacío.
function resolveCycleStamps(currentStamps: number, stampsRequired: number): number {
  const remainder = currentStamps % stampsRequired;
  return remainder === 0 && currentStamps > 0 ? stampsRequired : remainder;
}

async function main() {
  if (HERO_IMAGE_URI.startsWith("REEMPLAZAR")) {
    console.error(
      "[migrate-v3] Falta la URL pública real de hero-v3.jpg — edita HERO_IMAGE_URI en este script antes de correrlo.",
    );
    process.exit(1);
  }

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

  console.log(`[migrate-v3] Creando la clase nueva: ${classPayload.id}`);
  await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
  console.log("[migrate-v3] Clase _v3 lista (con heroImage).");

  const oldClassId = buildLoyaltyClassId(issuerId, BUSINESS_ID, "v2");
  console.log(`[migrate-v3] Clase vieja (${oldClassId}) queda intacta — no se borra.`);

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
    console.log(`[migrate-v3] Migrando ${customer.fullName} (${objectId}) → ${objectPayload.classId}`);
    await client.upsertLoyaltyObject(objectId, objectPayload);
  }

  console.log(`\n[migrate-v3] Listo — ${CUSTOMERS.length} clientes reales migrados a ${classPayload.id}.`);
}

main().catch((error) => {
  console.error("[migrate-v3] Falló:", error);
  process.exit(1);
});
