import { and, asc, count, eq, gte, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  customerBalances,
  customers,
  loyaltyPrograms,
  redemptions,
  rewardRules,
  transactions,
  type TenantTransaction,
  type VerifiedBusinessId,
} from "@loyalty/db";

// Todas las queries acá filtran explícitamente por businessId además de
// RLS (cinturón y tirantes, ver frontend-conventions) y corren dentro de
// withTenantContext — mismo primitivo que el resto de las features, esto
// es SOLO lectura nueva (SELECT), ninguna tabla ni columna nueva.

const ACTIVE_WINDOW_DAYS = 30;
const INACTIVE_WINDOW_DAYS = 60;
const NEAR_REWARD_GAP = 2;
const PERIOD_DAYS = 30;
const WEEKS_BACK = 8;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export type DashboardMetrics = {
  hasProgram: boolean;
  hasAnyCustomers: boolean;
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomersThisPeriod: number;
  visitsThisPeriod: number;
  redemptionsThisPeriod: number;
  nearRewardCustomers: number;
};

export async function loadDashboardMetrics(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
): Promise<DashboardMetrics> {
  const periodStart = daysAgo(PERIOD_DAYS);
  const activeSince = daysAgo(ACTIVE_WINDOW_DAYS);
  const inactiveBefore = daysAgo(INACTIVE_WINDOW_DAYS);

  const [program] = await tx
    .select()
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.businessId, businessId))
    .orderBy(asc(loyaltyPrograms.createdAt))
    .limit(1);

  const [{ value: totalCustomers }] = await tx
    .select({ value: count() })
    .from(customers)
    .where(eq(customers.businessId, businessId));

  if (!program || totalCustomers === 0) {
    return {
      hasProgram: Boolean(program),
      hasAnyCustomers: totalCustomers > 0,
      totalCustomers,
      activeCustomers: 0,
      inactiveCustomers: 0,
      newCustomersThisPeriod: 0,
      visitsThisPeriod: 0,
      redemptionsThisPeriod: 0,
      nearRewardCustomers: 0,
    };
  }

  const [{ value: activeCustomers }] = await tx
    .select({ value: count() })
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.businessId, businessId),
        eq(customerBalances.loyaltyProgramId, program.id),
        gte(customerBalances.lastStampAt, activeSince),
      ),
    );

  const [{ value: inactiveCustomers }] = await tx
    .select({ value: count() })
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.businessId, businessId),
        eq(customerBalances.loyaltyProgramId, program.id),
        lt(customerBalances.lastStampAt, inactiveBefore),
      ),
    );

  const [{ value: newCustomersThisPeriod }] = await tx
    .select({ value: count() })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), gte(customers.createdAt, periodStart)));

  const [{ value: visitsThisPeriod }] = await tx
    .select({ value: count() })
    .from(transactions)
    .where(and(eq(transactions.businessId, businessId), gte(transactions.createdAt, periodStart)));

  const [{ value: redemptionsThisPeriod }] = await tx
    .select({ value: count() })
    .from(redemptions)
    .where(and(eq(redemptions.businessId, businessId), gte(redemptions.redeemedAt, periodStart)));

  // "Próximos a recompensa": se computa en JS, no en SQL — el set de
  // reglas activas de un negocio es chico (unas pocas), traer balances +
  // umbrales y comparar en memoria es más simple y legible que una
  // subquery correlacionada, sin costo real a esta escala.
  const balances = await tx
    .select({ currentStamps: customerBalances.currentStamps })
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.businessId, businessId),
        eq(customerBalances.loyaltyProgramId, program.id),
      ),
    );
  const activeThresholds = (
    await tx
      .select({ stampsRequired: rewardRules.stampsRequired })
      .from(rewardRules)
      .where(
        and(
          eq(rewardRules.businessId, businessId),
          eq(rewardRules.loyaltyProgramId, program.id),
          eq(rewardRules.isActive, true),
        ),
      )
  )
    .map((r) => r.stampsRequired)
    .sort((a, b) => a - b);

  const nearRewardCustomers = balances.filter((balance) => {
    const nextThreshold = activeThresholds.find((t) => t > balance.currentStamps);
    if (nextThreshold === undefined) return false;
    return nextThreshold - balance.currentStamps <= NEAR_REWARD_GAP;
  }).length;

  return {
    hasProgram: true,
    hasAnyCustomers: totalCustomers > 0,
    totalCustomers,
    activeCustomers,
    inactiveCustomers,
    newCustomersThisPeriod,
    visitsThisPeriod,
    redemptionsThisPeriod,
    nearRewardCustomers,
  };
}

export type WeeklyPoint = { week: string; value: number };
export type NewVsReturningPoint = { week: string; nuevos: number; recurrentes: number };
export type RedemptionRatePoint = { week: string; tasa: number };

function fillWeeks<T extends { week: string }>(
  rows: T[],
  weeksBack: number,
  empty: (week: string) => T,
): T[] {
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  const out: T[] = [];
  const now = new Date();
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    // Lunes de esa semana, como YYYY-MM-DD — mismo formato que devuelve
    // date_trunc('week', ...)::date de Postgres.
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    const key = d.toISOString().slice(0, 10);
    out.push(byWeek.get(key) ?? empty(key));
  }
  return out;
}

export async function loadVisitsByWeek(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
): Promise<WeeklyPoint[]> {
  const since = daysAgo(WEEKS_BACK * 7);
  const rows = await tx
    .select({
      week: sql<string>`date_trunc('week', ${transactions.createdAt})::date`.as("week"),
      value: count(),
    })
    .from(transactions)
    .where(and(eq(transactions.businessId, businessId), gte(transactions.createdAt, since)))
    .groupBy(sql`date_trunc('week', ${transactions.createdAt})::date`);

  return fillWeeks(rows.map((r) => ({ week: String(r.week), value: r.value })), WEEKS_BACK, (week) => ({
    week,
    value: 0,
  }));
}

export async function loadNewVsReturningByWeek(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
): Promise<NewVsReturningPoint[]> {
  const since = daysAgo(WEEKS_BACK * 7);

  const newRows = await tx
    .select({
      week: sql<string>`date_trunc('week', ${customers.createdAt})::date`.as("week"),
      value: count(),
    })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), gte(customers.createdAt, since)))
    .groupBy(sql`date_trunc('week', ${customers.createdAt})::date`);

  // "Recurrente" = visitó esa semana y su cuenta ya existía ANTES de que
  // esa semana empezara (así un alta nueva con su primera visita la misma
  // semana no se cuenta dos veces).
  const returningRows = await tx
    .select({
      week: sql<string>`date_trunc('week', ${transactions.createdAt})::date`.as("week"),
      value: sql<number>`count(distinct ${transactions.customerId})`,
    })
    .from(transactions)
    .innerJoin(
      customers,
      and(eq(customers.id, transactions.customerId), eq(customers.businessId, transactions.businessId)),
    )
    .where(
      and(
        eq(transactions.businessId, businessId),
        gte(transactions.createdAt, since),
        sql`${customers.createdAt} < date_trunc('week', ${transactions.createdAt})`,
      ),
    )
    .groupBy(sql`date_trunc('week', ${transactions.createdAt})::date`);

  const newByWeek = new Map(newRows.map((r) => [String(r.week), r.value]));
  const returningByWeek = new Map(returningRows.map((r) => [String(r.week), Number(r.value)]));

  return fillWeeks<NewVsReturningPoint>(
    Array.from(new Set([...newByWeek.keys(), ...returningByWeek.keys()])).map((week) => ({
      week,
      nuevos: newByWeek.get(week) ?? 0,
      recurrentes: returningByWeek.get(week) ?? 0,
    })),
    WEEKS_BACK,
    (week) => ({ week, nuevos: 0, recurrentes: 0 }),
  );
}

export async function loadRedemptionRateByWeek(
  tx: TenantTransaction,
  businessId: VerifiedBusinessId,
): Promise<RedemptionRatePoint[]> {
  const since = daysAgo(WEEKS_BACK * 7);

  const visitRows = await tx
    .select({
      week: sql<string>`date_trunc('week', ${transactions.createdAt})::date`.as("week"),
      value: count(),
    })
    .from(transactions)
    .where(and(eq(transactions.businessId, businessId), gte(transactions.createdAt, since)))
    .groupBy(sql`date_trunc('week', ${transactions.createdAt})::date`);

  const redemptionRows = await tx
    .select({
      week: sql<string>`date_trunc('week', ${redemptions.redeemedAt})::date`.as("week"),
      value: count(),
    })
    .from(redemptions)
    .where(and(eq(redemptions.businessId, businessId), gte(redemptions.redeemedAt, since)))
    .groupBy(sql`date_trunc('week', ${redemptions.redeemedAt})::date`);

  const visitsByWeek = new Map(visitRows.map((r) => [String(r.week), r.value]));
  const redemptionsByWeek = new Map(redemptionRows.map((r) => [String(r.week), r.value]));

  return fillWeeks<RedemptionRatePoint>(
    Array.from(new Set([...visitsByWeek.keys(), ...redemptionsByWeek.keys()])).map((week) => {
      const visits = visitsByWeek.get(week) ?? 0;
      const reds = redemptionsByWeek.get(week) ?? 0;
      return { week, tasa: visits > 0 ? Math.round((reds / visits) * 1000) / 10 : 0 };
    }),
    WEEKS_BACK,
    (week) => ({ week, tasa: 0 }),
  );
}
