import { and, asc, eq, isNotNull } from "drizzle-orm";
import {
  businesses,
  customerBalances,
  customers,
  locations,
  loyaltyPrograms,
  rewardRules,
  type TenantTransaction,
  type VerifiedBusinessId,
} from "@loyalty/db";
import { availableRewards, countAvailableRedemptions, cycleStampProgress } from "@loyalty/core";
import { isUuid } from "../tenant";

// Datos compartidos entre la generación del .pkpass de Apple
// (passGeneration.ts) y el link "Add to Google Wallet"
// (googleSaveLink.ts) — misma fuente, mismo contenido mínimo (nunca
// apellido/teléfono/email), para que ambas plataformas muestren
// exactamente el mismo progreso sin duplicar las queries en cada archivo.
export type CustomerLoyaltySnapshot = {
  businessName: string;
  programName: string;
  customerFirstName: string | null;
  currentStamps: number;
  stampsRequired: number;
  // Recompensa YA desbloqueada al balance actual (o null) — lo que
  // consume Apple (passJson.ts, "Recompensa disponible"): solo se anuncia
  // una vez lista para canjear, nunca antes.
  rewardName: string | null;
  // Recompensa hacia la que el cliente está avanzando, sin importar si ya
  // la desbloqueó — lo que consume Google (loyaltyPayload.ts,
  // buildProgressMessage): "4 de 6 sellos, a 2 de tu X" solo tiene sentido
  // si X existe ANTES de llegar. `rules` ya viene ordenado por
  // stampsRequired ascendente, así que el primero es el próximo hito.
  nextRewardName: string | null;
  // Canjes REALES disponibles ahora mismo — countAvailableRedemptions(),
  // NO availableRewards().length. Distinción real: con una sola regla de
  // costo 6 y currentStamps=12, hay DOS canjes posibles (applyRedemption
  // arrastra el sobrante y permite canjes consecutivos de la misma
  // regla) — availableRewards().length se quedaría en 1 (cuenta reglas
  // DISTINTAS desbloqueadas, no cuántas veces se puede canjear la misma).
  availableRewardsCount: number;
  // Progreso del CICLO ACTUAL (currentStamps % stampsRequired, ciclo
  // completo si currentStamps es múltiplo exacto — ver
  // cycleStampProgress()) — lo que consume el grid físico de Apple
  // (passGeneration.ts elige qué strip-N.png servir) y el mensaje de
  // progreso de Google (loyaltyPayload.ts). Un cliente con más sellos que
  // el requisito ya NO se ve congelado en el grid lleno — ve el avance
  // real hacia su siguiente recompensa.
  cycleStamps: number;
  walletToken: string;
  // Branding real del negocio (nullable — sin logo/hero cargados, el
  // .pkpass sigue el layout plano de siempre, nunca un placeholder
  // inventado). businessWalletLogoUrl es DISTINTO de logoUrl (el de
  // /enroll, un crop circular ya aprobado) — deliberadamente separado
  // para no cambiar lo que /enroll ya muestra.
  businessWalletLogoUrl: string | null;
  businessBrandColorHex: string | null;
  businessWalletHeroUrl: string | null;
  // URLs de Google Wallet — HTTPS públicas (Cloudinary hoy), a diferencia
  // de las de Apple arriba, que son archivos locales. googleWideLogoUri
  // queda en null hasta que exista el asset del wordmark horizontal.
  businessGoogleLogoUri: string | null;
  businessGoogleHeroUri: string | null;
  businessGoogleWideLogoUri: string | null;
  // Sucursales ACTIVAS con coordenadas reales cargadas — para
  // notificación por proximidad (Apple locations, Google
  // merchantLocations). Vacío si el negocio no tiene ninguna sucursal con
  // lat/long todavía (nunca una ubicación inventada).
  businessLocations: Array<{ latitude: number; longitude: number }>;
};

export async function loadCustomerLoyaltySnapshot(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
  customerId: string,
): Promise<CustomerLoyaltySnapshot | null> {
  // Mismo guard que findInTenant (lib/tenant.ts): un id malformado no debe
  // llegar a Postgres como ::uuid inválido (22P02 → 500 distinguible de
  // "no existe" — un oráculo de IDOR). Hoy los tres callers ya validan
  // antes de llegar acá, pero esta función es compartida y va a ganar
  // callers (hallazgo de la segunda revisión de seguridad de Fase 4).
  if (!isUuid(customerId)) {
    return null;
  }

  const [business] = await tx
    .select({
      name: businesses.name,
      walletLogoUrl: businesses.walletLogoUrl,
      brandColorHex: businesses.brandColorHex,
      walletHeroUrl: businesses.walletHeroUrl,
      googleLogoUri: businesses.googleLogoUri,
      googleHeroUri: businesses.googleHeroUri,
      googleWideLogoUri: businesses.googleWideLogoUri,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  const [customer] = await tx
    .select({ fullName: customers.fullName, walletToken: customers.walletToken })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
    .limit(1);

  const [program] = await tx
    .select()
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.businessId, businessId))
    .orderBy(asc(loyaltyPrograms.createdAt))
    .limit(1);

  if (!business || !customer || !program) {
    return null;
  }

  const [balance] = await tx
    .select()
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.businessId, businessId),
        eq(customerBalances.customerId, customerId),
        eq(customerBalances.loyaltyProgramId, program.id),
      ),
    )
    .limit(1);
  const currentStamps = balance?.currentStamps ?? 0;

  const rules = await tx
    .select()
    .from(rewardRules)
    .where(
      and(
        eq(rewardRules.businessId, businessId),
        eq(rewardRules.loyaltyProgramId, program.id),
        eq(rewardRules.isActive, true),
      ),
    )
    .orderBy(asc(rewardRules.stampsRequired));
  const unlockedRewards = availableRewards(currentStamps, rules);
  const [firstAvailable] = unlockedRewards;

  const locationRows = await tx
    .select({ latitude: locations.latitude, longitude: locations.longitude })
    .from(locations)
    .where(
      and(
        eq(locations.businessId, businessId),
        eq(locations.isActive, true),
        isNotNull(locations.latitude),
        isNotNull(locations.longitude),
      ),
    );

  return {
    businessName: business.name,
    programName: program.name,
    customerFirstName: customer.fullName ? customer.fullName.split(" ")[0] : null,
    currentStamps,
    stampsRequired: program.stampsRequired,
    rewardName: firstAvailable?.name ?? null,
    nextRewardName: rules[0]?.name ?? null,
    availableRewardsCount: countAvailableRedemptions(currentStamps, rules),
    cycleStamps: cycleStampProgress(currentStamps, program.stampsRequired),
    walletToken: customer.walletToken,
    businessWalletLogoUrl: business.walletLogoUrl,
    businessBrandColorHex: business.brandColorHex,
    businessWalletHeroUrl: business.walletHeroUrl,
    businessGoogleLogoUri: business.googleLogoUri,
    businessGoogleHeroUri: business.googleHeroUri,
    businessGoogleWideLogoUri: business.googleWideLogoUri,
    // isNotNull ya filtra los null en SQL, pero el tipo inferido de
    // drizzle sigue siendo `number | null` por columna — el cast refleja
    // lo que el WHERE ya garantiza, no lo cambia.
    businessLocations: locationRows as Array<{ latitude: number; longitude: number }>,
  };
}
