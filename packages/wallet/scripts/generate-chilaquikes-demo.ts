// Genera el link "Add to Google Wallet" de un pase de DEMO para Chilaquikes
// (presentación a cliente, no un negocio/cliente real en el esquema).
// Mismo camino que producción (apps/web/lib/wallet/googleSaveLink.ts): el
// JWT firmado embebe la Loyalty Class + Loyalty Object completos, así que
// NO hace falta llamar upsertLoyaltyClass/Object antes — Google los crea
// del lado suyo cuando el usuario toca "Guardar". Sin llamadas de red:
// firma local con jose contra la cuenta de servicio real.
//
// Uso: pnpm --filter @loyalty/wallet demo:chilaquikes

import { randomBytes } from "node:crypto";
import { createRealGoogleWalletClient } from "../src/google/signer.ts";
import { buildLoyaltyClassPayload, buildLoyaltyObjectPayload } from "../src/google/loyaltyPayload.ts";
import { resolveWalletConfig } from "../src/config.ts";

const config = resolveWalletConfig();

if (!config.google.credentials) {
  console.error(
    `[demo] Google Wallet no está activo. Faltan: ${config.google.status.missing.join(", ")}.\n` +
      "Revisa WALLET_GOOGLE_ISSUER_ID y WALLET_GOOGLE_SERVICE_ACCOUNT_JSON en apps/web/.env.local.",
  );
  process.exit(1);
}

const { issuerId } = config.google.credentials;
const client = createRealGoogleWalletClient(config.google.credentials);

// IDs de demo — nunca UUIDs reales de negocio/cliente, para que quede
// obvio que esta clase/objeto no corresponde a ningún tenant del esquema.
// Sufijo _v2: un save-link JWT que apunta a un classId YA CREADO del lado
// de Google no fuerza una redefinición de esa clase (el título viejo
// "Programa de sellos" quedó pegado pese a mandar programName nuevo) — la
// única forma confiable de cambiar campos de la clase es un classId nuevo.
const DEMO_BUSINESS_ID = "demo-chilaquikes-v2";
const DEMO_CUSTOMER_ID = "demo-maria-gonzalez-v2";

// #DB0A00 → rojo de marca real (sampleado del logo original), reemplaza
// el rojo chile genérico de la primera versión.
const BRAND_RGB: [number, number, number] = [0xdb, 0x0a, 0x00];

// Versión procesada del logo (fondo recortado a transparente vía
// flood-fill + recorte a bounding box + centrado en lienzo cuadrado
// 660×660) — ver chilaquikes-logo-pass.png en la raíz del repo. La
// primera versión (28F64EC9-...) traía el fondo rojo sólido incluido, que
// Google hubiera recortado como si fuera parte del logo.
const LOGO_URI =
  "https://res.cloudinary.com/uvid8m0k/image/upload/v1786000242/chilaquikes-logo-pass_da7axu.png";

// Token opaco de demo — mismo formato que un wallet_token real (opaco, sin
// datos), pero claramente marcado como demo en el prefijo.
const DEMO_WALLET_TOKEN = `demo_${randomBytes(12).toString("hex")}`;

const classPayload = buildLoyaltyClassPayload({
  issuerId,
  businessId: DEMO_BUSINESS_ID,
  businessName: "Chilaquikes",
  programName: "Club de la Gorrita",
  backgroundRgb: BRAND_RGB,
  programLogoUri: LOGO_URI,
});

const objectPayload = buildLoyaltyObjectPayload({
  issuerId,
  businessId: DEMO_BUSINESS_ID,
  customerId: DEMO_CUSTOMER_ID,
  customerFirstName: "María González",
  currentStamps: 4,
  stampsRequired: 6,
  rewardName: "Orden de chilaquiles gratis",
  walletToken: DEMO_WALLET_TOKEN,
});

const saveLink = await client.buildSaveLink({
  loyaltyClasses: [classPayload],
  loyaltyObjects: [objectPayload],
});

console.log("\n=== Pase de demo — Chilaquikes ===");
console.log(`Issuer ID:      ${issuerId}`);
console.log(`Class ID:       ${classPayload.id}`);
console.log(`Object ID:      ${objectPayload.id}`);
console.log(`Wallet token:   ${DEMO_WALLET_TOKEN}`);
console.log(`Progreso:       4 / 6 sellos`);
console.log(`Recompensa:     Orden de chilaquiles gratis`);
console.log(`Logo:           ${LOGO_URI}`);
console.log("\nAbre este link en el teléfono agregado como tester (Google Wallet API → Set up test accounts):\n");
console.log(saveLink);
console.log();
