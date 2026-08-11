// Crea (o actualiza) la Loyalty Class OFICIAL de producción de CHILAQUIKES
// en los servidores reales de Google Wallet, y emite un pase de
// verificación real contra ella. Mismas credenciales reales de
// apps/web/.env.local que ya usaba generate-chilaquikes-demo.ts — la
// cuenta emisora es la misma, lo que cambió es su estatus de aprobación
// (confirmado con el usuario, no una cuenta nueva).
//
// classId con sufijo _prod, deliberadamente DISTINTO del que la app en
// vivo calcula para el negocio real (buildLoyaltyClassId(issuerId,
// businessId) con el UUID real de CHILAQUIKES en producción) — esta es
// una clase de referencia/verificación creada a mano, para probar
// campos/mensajes ANTES de que un cliente real los vea (el flujo real,
// apps/web/lib/wallet/googleSaveLink.ts, ya lee la misma marca real desde
// businesses.google_logo_uri/google_hero_uri/brand_color_hex — ver el
// aviso que esto imprime al final).
//
// upsertLoyaltyClass es una llamada REST real y explícita (POST, o PATCH
// si ya existe) — a diferencia del link "Add to Wallet" de
// generate-chilaquikes-demo.ts, que solo EMBEBE la clase en el JWT y deja
// que Google la cree perezosamente cuando alguien lo abre. Crearla así,
// explícita, deja la clase verificable/administrable desde ya en la
// consola de Google, sin depender de que alguien abra el link primero.
//
// Uso: pnpm --filter @loyalty/wallet exec node --env-file-if-exists=../../apps/web/.env.local --experimental-strip-types scripts/create-chilaquikes-production-class.ts

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
    `[prod-class] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
      "Revisa WALLET_GOOGLE_ISSUER_ID y WALLET_GOOGLE_SERVICE_ACCOUNT_JSON en apps/web/.env.local.",
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

const PROD_BUSINESS_ID = "chilaquikes_prod";
const PROD_CUSTOMER_ID = `verify-${randomBytes(6).toString("hex")}`;

// Mismo rojo real (sampleado del logo) que ya usaba la clase demo — es la
// clase demo la que copió este valor de acá conceptualmente, no al revés;
// queda documentado una sola vez.
const BRAND_RGB: [number, number, number] = [0xdb, 0x0a, 0x00];

const LOGO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786000242/chilaquikes-logo-pass_da7axu.png";
const HERO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786166822/heroChilaquiles_mfa0ly.jpg";

const REWARD_NAME = "Orden de chilaquiles gratis";
const STAMPS_REQUIRED = 6;
const DEMO_CURRENT_STAMPS = 4; // "4 de 6" — mismo ejemplo que pidió el usuario para verificar el texto motivador.

const classPayload = buildLoyaltyClassPayload({
  issuerId,
  businessId: PROD_BUSINESS_ID,
  businessName: "CHILAQUIKES",
  programName: "Tarjeta de sellos Chilaquikes",
  backgroundRgb: BRAND_RGB,
  programLogoUri: LOGO_URI,
  heroImageUri: HERO_URI,
  // Sin wideProgramLogoUri: no existe un asset diseñado para ese formato
  // ancho — mandar el logo cuadrado ahí se vería estirado/mal recortado.
});

console.log("[prod-class] Creando/actualizando la Loyalty Class real en Google Wallet…");
await client.upsertLoyaltyClass(classPayload.id as string, classPayload);
console.log(`[prod-class] Listo: ${classPayload.id}`);

const objectPayload = buildLoyaltyObjectPayload({
  issuerId,
  businessId: PROD_BUSINESS_ID,
  customerId: PROD_CUSTOMER_ID,
  customerFirstName: "Verificación",
  // DEMO_CURRENT_STAMPS (4) < STAMPS_REQUIRED (6): cycleStamps es el mismo
  // valor, sin envolver — ver cycleStampProgress en @loyalty/core para el
  // caso con excedente, que este script de verificación no necesita.
  cycleStamps: DEMO_CURRENT_STAMPS,
  stampsRequired: STAMPS_REQUIRED,
  rewardName: REWARD_NAME,
  walletToken: `verify_${randomBytes(12).toString("hex")}`,
});

const saveLink = await client.buildSaveLink({
  loyaltyClasses: [classPayload],
  loyaltyObjects: [objectPayload],
});

console.log("\n=== Pase de VERIFICACIÓN — clase de producción CHILAQUIKES ===");
console.log(`Issuer ID:      ${issuerId}`);
console.log(`Class ID:       ${classPayload.id}`);
console.log(`Object ID:      ${objectPayload.id}`);
console.log(`reviewStatus:   ${(classPayload as { reviewStatus: string }).reviewStatus}`);
console.log(`Progreso:       ${DEMO_CURRENT_STAMPS} / ${STAMPS_REQUIRED} sellos`);
console.log(`Recompensa:     ${REWARD_NAME}`);
console.log(`Logo:           ${LOGO_URI}`);
console.log(`Hero:           ${HERO_URI}`);
console.log(`Color:          #DB0A00`);
console.log(
  "\nAbre este link para verlo (si la cuenta emisora ya está aprobada, no debería llevar [TEST ONLY]):\n",
);
console.log(saveLink);
console.log(
  "\n[aviso] Esta clase sigue siendo solo de VERIFICACIÓN (classId chilaquikes_prod, objeto\n" +
    "de prueba) — pero ya no es la única con marca real: apps/web/lib/wallet/googleSaveLink.ts\n" +
    "(el flujo que SÍ usan los clientes al inscribirse en /enroll) ahora lee logo/hero/color desde\n" +
    "businesses.google_logo_uri/google_hero_uri/brand_color_hex — mismas URLs de Cloudinary que acá.\n" +
    "El classId real de cliente (biz_<business_id real>) es uno DISTINTO a este, y se crea la\n" +
    "primera vez que alguien realmente toca 'Agregar a Google Wallet' en /enroll.\n",
);
