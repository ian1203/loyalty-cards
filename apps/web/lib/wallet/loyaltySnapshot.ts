import { and, asc, eq } from "drizzle-orm";
import {
  businesses,
  customerBalances,
  customers,
  loyaltyPrograms,
  rewardRules,
  type TenantTransaction,
  type VerifiedBusinessId,
} from "@loyalty/db";
import { availableRewards } from "@loyalty/core";
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
  rewardName: string | null;
  walletToken: string;
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
    .select({ name: businesses.name })
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
  const [firstAvailable] = availableRewards(currentStamps, rules);

  return {
    businessName: business.name,
    programName: program.name,
    customerFirstName: customer.fullName ? customer.fullName.split(" ")[0] : null,
    currentStamps,
    stampsRequired: program.stampsRequired,
    rewardName: firstAvailable?.name ?? null,
    walletToken: customer.walletToken,
  };
}
