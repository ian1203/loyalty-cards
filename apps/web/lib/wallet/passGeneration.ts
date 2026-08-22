import { and, eq } from "drizzle-orm";
import { buildPassJson, buildPkpass, buildRelevantText, type RgbColor } from "@loyalty/wallet";
import { walletPasses, type TenantTransaction, type VerifiedBusinessId } from "@loyalty/db";
import { getApplePassTypeIdentifier, getAppleTeamIdentifier, getPkpassSigner } from "./adapters";
import { deriveBrandColor, hexToRgb } from "./brandColor";
import { loadCustomerLoyaltySnapshot, type CustomerLoyaltySnapshot } from "./loyaltySnapshot";
import { resolveBusinessAssetBuffer } from "./businessAssets";

export type GeneratePkpassResult =
  | { ok: true; pkpass: Buffer; walletPassId: string }
  | { ok: false; reason: "no_program" | "no_pass_row" };

// Datos ya resueltos de la DB, listos para construir el .pkpass SIN volver
// a tocar Postgres — separado de GeneratePkpassResult para poder cruzar el
// límite de una transacción (ver loadApplePassGenerationInputs/
// buildApplePkpassFromInputs más abajo).
export type ApplePassGenerationInputs = {
  snapshot: CustomerLoyaltySnapshot;
  walletPassId: string;
  walletPassAuthenticationToken: string;
};

export type LoadApplePassGenerationInputsResult =
  | { ok: true; inputs: ApplePassGenerationInputs }
  | { ok: false; reason: "no_program" | "no_pass_row" };

// logo.png/strip.png son assets ESTÁTICOS (apps/web/public/passes/{slug}/,
// generados offline con packages/wallet/scripts/generate-pass-assets.ts) —
// decisión de arquitectura tras varios intentos reales de hacer que sharp
// cargue su binario nativo en el runtime serverless de Vercel (no lo
// logramos: ERR_DLOPEN_FAILED persistente incluso con la versión "buena"
// documentada). Cero compositing en este archivo — solo lectura de bytes
// ya hechos, siguiendo la convención de nombre de Apple (logo.png,
// logo@2x.png, logo@3x.png).
function deriveScaledUrl(url: string, suffix: "@2x" | "@3x"): string {
  const dotIndex = url.lastIndexOf(".");
  if (dotIndex === -1) return `${url}${suffix}`;
  return `${url.slice(0, dotIndex)}${suffix}${url.slice(dotIndex)}`;
}

// businessWalletHeroUrl sigue apuntando a la base sin cambios en la DB
// (".../strip.png") — generate-pass-assets.ts (Sección A2) ya no produce
// ESE archivo como el que se usa, sino un archivo POR conteo de sellos
// (strip-0.png..strip-N.png). Insertar "-{n}" antes de la extensión, del
// mismo modo que deriveScaledUrl inserta "@2x"/"@3x", evita una columna
// nueva en businesses: el conteo clamped se resuelve acá, con el balance
// real del cliente en el momento de generar el .pkpass.
function deriveStampCountUrl(url: string, stampCount: number): string {
  const dotIndex = url.lastIndexOf(".");
  if (dotIndex === -1) return `${url}-${stampCount}`;
  return `${url.slice(0, dotIndex)}-${stampCount}${url.slice(dotIndex)}`;
}

// icon.png vive en el mismo directorio que logo.png (generate-pass-assets.ts
// los escribe juntos) — se deriva del mismo businessWalletLogoUrl en vez de
// agregar una columna nueva en businesses, mismo criterio que
// deriveStampCountUrl de arriba.
function deriveIconUrl(logoUrl: string): string {
  const slashIndex = logoUrl.lastIndexOf("/");
  if (slashIndex === -1) return "icon.png";
  return `${logoUrl.slice(0, slashIndex + 1)}icon.png`;
}

async function loadStaticAssetSet(
  baseUrl: string | null,
): Promise<{ at1x: Buffer; at2x: Buffer; at3x: Buffer } | undefined> {
  if (!baseUrl) return undefined;
  const [at1x, at2x, at3x] = await Promise.all([
    resolveBusinessAssetBuffer(baseUrl),
    resolveBusinessAssetBuffer(deriveScaledUrl(baseUrl, "@2x")),
    resolveBusinessAssetBuffer(deriveScaledUrl(baseUrl, "@3x")),
  ]);
  // Best-effort de verdad: si falta cualquiera de las 3 escalas, el pase
  // sigue siendo válido sin esa pieza visual — nunca tumba el pase
  // completo (mismo criterio que notifyWalletOfTransaction).
  if (!at1x || !at2x || !at3x) {
    console.error(`loadStaticAssetSet: falta alguna escala de ${baseUrl}`);
    return undefined;
  }
  return { at1x, at2x, at3x };
}

// FASE 1 — TODO lo que necesita tocar Postgres, y NADA más. Hallazgo real
// de auditoría de rendimiento (ver docs/HISTORY.md): antes de este split,
// esta lectura y la FASE 2 completa (fetches de red + firma PKCS#7, ver
// buildApplePkpassFromInputs abajo) corrían juntas dentro de la misma
// transacción — la conexión de Postgres quedaba abierta 2-3 segundos
// enteros por trabajo que no la necesitaba, agravando exactamente el tipo
// de agotamiento del pool ya documentado como incidente real (ver
// vitest.config.ts, PG_POOL_MAX). El caller debe cerrar/salir de su
// withTenantContext ANTES de llamar a buildApplePkpassFromInputs.
export async function loadApplePassGenerationInputs(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<LoadApplePassGenerationInputsResult> {
  const snapshot = await loadCustomerLoyaltySnapshot(tx, businessId, customerId);
  if (!snapshot) {
    return { ok: false, reason: "no_program" };
  }

  const [walletPass] = await tx
    .select({ id: walletPasses.id, authenticationToken: walletPasses.authenticationToken })
    .from(walletPasses)
    .where(
      and(
        eq(walletPasses.businessId, businessId),
        eq(walletPasses.customerId, customerId),
        eq(walletPasses.platform, "apple"),
      ),
    )
    .limit(1);
  if (!walletPass) {
    return { ok: false, reason: "no_pass_row" };
  }

  return {
    ok: true,
    inputs: {
      snapshot,
      walletPassId: walletPass.id,
      walletPassAuthenticationToken: walletPass.authenticationToken,
    },
  };
}

// FASE 2 — fetches de red (assets estáticos, ya cacheados por proceso) +
// firma PKCS#7 (CPU). Deliberadamente SIN `tx`: nada acá toca la DB, así
// que nunca debe correr con una conexión de Postgres esperando de brazos
// cruzados. `businessId` se sigue necesitando (no para la DB — solo como
// semilla determinística de `deriveBrandColor` más abajo).
export async function buildApplePkpassFromInputs(
  businessId: VerifiedBusinessId,
  inputs: ApplePassGenerationInputs,
): Promise<{ ok: true; pkpass: Buffer; walletPassId: string }> {
  const { snapshot, walletPassId, walletPassAuthenticationToken } = inputs;

  // Sin fallback silencioso a localhost (sería un .pkpass firmado y
  // distribuido con un webServiceURL roto en producción, que nunca se
  // detectaría solo) — mismo criterio que admin/actions.ts para esta
  // misma variable: si falta, falla fuerte, no en silencio.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL no está configurado.");
  }

  // Branding real (businesses.brand_color_hex) SOLO cambia la paleta —
  // sin él, el pase se ve EXACTAMENTE como antes (fondo blanco, texto gris
  // oscuro, ícono hash-derivado): cero cambio de comportamiento para
  // negocios sin marca cargada todavía.
  const brandColorHex = snapshot.businessBrandColorHex;
  const backgroundRgb: RgbColor = brandColorHex ? hexToRgb(brandColorHex) : [255, 255, 255];
  const foregroundRgb: RgbColor = brandColorHex ? [255, 244, 227] : [30, 30, 30];
  const labelRgb: RgbColor = brandColorHex ? [255, 217, 179] : [110, 110, 110];
  const iconRgb: RgbColor = brandColorHex ? backgroundRgb : deriveBrandColor(businessId);

  // El grid muestra el progreso del CICLO ACTUAL, no el total acumulado
  // congelado en el máximo (bug real corregido: un cliente con 8 sellos y
  // límite 6 se veía con el grid lleno de forma estática para siempre, en
  // vez de ver 2/6 hacia su próxima recompensa). snapshot.cycleStamps ya
  // viene calculado por cycleStampProgress() (@loyalty/core, vía
  // loyaltySnapshot.ts) — múltiplo exacto del requisito = ciclo completo,
  // nunca 0 vacío. Solo existe un strip pre-generado por cada valor
  // 0..stampsRequired (Sección A2), y cycleStamps ya cae en ese rango por
  // construcción.
  const stripUrl = snapshot.businessWalletHeroUrl
    ? deriveStampCountUrl(snapshot.businessWalletHeroUrl, snapshot.cycleStamps)
    : null;

  const iconUrl = snapshot.businessWalletLogoUrl ? deriveIconUrl(snapshot.businessWalletLogoUrl) : null;

  const [logoPng, stripPng, iconPng] = await Promise.all([
    loadStaticAssetSet(snapshot.businessWalletLogoUrl),
    loadStaticAssetSet(stripUrl),
    loadStaticAssetSet(iconUrl),
  ]);

  // relevantText usa nextRewardName (no rewardName) — mismo motivo que
  // buildProgressMessage de Google (loyaltyPayload.ts): el geofence tiene
  // que decir algo útil ANTES de desbloquear la recompensa, no solo
  // después. Sin reglas activas (nextRewardName null), no hay locations
  // en el pase — un geofence sin texto que mostrar no aporta nada.
  const relevantText = snapshot.nextRewardName
    ? buildRelevantText(
        snapshot.cycleStamps,
        snapshot.stampsRequired,
        snapshot.nextRewardName,
        snapshot.customerFirstName,
      )
    : null;
  const appleLocations =
    relevantText && snapshot.businessLocations.length > 0
      ? snapshot.businessLocations.map((loc) => ({ ...loc, relevantText }))
      : undefined;

  const passJson = buildPassJson({
    serialNumber: walletPassId,
    authenticationToken: walletPassAuthenticationToken,
    webServiceUrl: `${siteUrl}/api/wallet/apple`,
    passTypeIdentifier: getApplePassTypeIdentifier(),
    teamIdentifier: getAppleTeamIdentifier(),
    organizationName: snapshot.businessName,
    programName: snapshot.programName,
    customerFirstName: snapshot.customerFirstName,
    cycleStamps: snapshot.cycleStamps,
    stampsRequired: snapshot.stampsRequired,
    rewardName: snapshot.rewardName,
    nextRewardName: snapshot.nextRewardName,
    availableRewardsCount: snapshot.availableRewardsCount,
    walletToken: snapshot.walletToken,
    colors: { backgroundRgb, foregroundRgb, labelRgb },
    locations: appleLocations,
    promoMessage: snapshot.businessLastPromoMessage,
    howItWorksText: snapshot.passBackFields?.howItWorksText,
    howToEarnStampText: snapshot.passBackFields?.howToEarnStampText,
    validUntilText: snapshot.passBackFields?.validUntilText,
    reviewLinkUrl: snapshot.passBackFields?.reviewLinkUrl,
    reviewLinkLabel: snapshot.passBackFields?.reviewLinkLabel,
    createdWithUrl: snapshot.passBackFields?.createdWithUrl,
    createdWithLabel: snapshot.passBackFields?.createdWithLabel,
    showAccountSummaryFields: snapshot.passBackFields?.showAccountSummaryFields,
    totalStampsEarned: snapshot.lifetimeStamps ?? undefined,
    stampsUntilNextReward: snapshot.stampsUntilNextReward,
  });

  const pkpass = await buildPkpass({
    passJson,
    signer: getPkpassSigner(),
    iconRgb,
    logoPng,
    stripPng,
    iconPng,
  });

  return { ok: true, pkpass, walletPassId };
}

// Wrapper de conveniencia: combina FASE 1 + FASE 2 en una sola llamada,
// mismo comportamiento observable que la función original antes de este
// split — para callers donde el boundary de tx todavía no importa (o no
// se migraron). Los 2 callers reales de descarga (customers/[id]/wallet/
// apple y publicEnrollWallet) SÍ deben usar las dos fases por separado
// para soltar la conexión de Postgres antes del trabajo lento — ver
// docs/HISTORY.md.
export async function generateApplePkpassForCustomer(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<GeneratePkpassResult> {
  const loaded = await loadApplePassGenerationInputs(tx, businessId, customerId);
  if (!loaded.ok) {
    return loaded;
  }
  return buildApplePkpassFromInputs(businessId, loaded.inputs);
}
