import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loyaltyPrograms, rewardRules } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { cycleStampProgress, evaluateRedemption } from "@loyalty/core";
import { saveProgramForSession, saveRewardRuleForSession } from "../app/(product)/rewards/logic";
import { requireTenantSession } from "../lib/supabase/session";
import type { TenantSession } from "../lib/tenant";
import { createBusinessWithRealOwner, createPlatformAdmin, form, signInAsCookieJar } from "./support/testAuth";

// Reproduce el síntoma real reportado (pase de Wallet contradictorio) con
// las MISMAS funciones puras que loyaltySnapshot.ts/scanner/logic.ts usan
// en producción — sin mocks del motor.
describe("Regresión — grid visual y elegibilidad de canje nunca deben contradecirse", () => {
  it("caso ROTO (antes del fix): programa=8, regla=6 → a los 6 sellos el grid muestra 6/8 sin llenar pero el canje YA está permitido", () => {
    const cycleStamps = cycleStampProgress(6, 8);
    const redemption = evaluateRedemption({ currentStamps: 6, ruleActive: true, ruleCost: 6 });
    expect(cycleStamps).toBe(6); // grid: 6 de 8, NO lleno
    expect(redemption.allowed).toBe(true); // pero ya "puedes canjear" — la contradicción real
  });

  it("caso CORREGIDO: programa=8, regla=8 → el grid solo se ve lleno exactamente cuando el canje se habilita", () => {
    for (let stamps = 0; stamps <= 8; stamps++) {
      const cycleStamps = cycleStampProgress(stamps, 8);
      const redemption = evaluateRedemption({ currentStamps: stamps, ruleActive: true, ruleCost: 8 });
      const gridFull = cycleStamps === 8;
      expect(redemption.allowed).toBe(gridFull);
    }
  });
});

// Bug real corregido (ver diagnóstico de /rewards): program.stampsRequired
// (grid visual del pase + progreso) y rule.stampsRequired (lo que
// evaluateRedemption/applyRedemption usan para decidir el canje,
// packages/core/src/loyalty.ts) son campos independientes sin validación
// entre sí — un cliente real llegó a ver "ya puedes canjear" con la
// tarjeta visualmente sin llenar. Decisión de producto: program.stampsRequired
// es SIEMPRE el ciclo completo; ninguna recompensa puede pedir más sellos
// que eso.
describe("Fix — el costo de una recompensa nunca puede superar el ciclo del programa", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "rewards-stamps-consistency-1";

  let businessId: string;
  let session: TenantSession;

  beforeAll(async () => {
    const platformAdminAuthUserId = await createPlatformAdmin(
      `rewards-stamps-admin-${suffix}@test.dev`,
      password,
    );
    const { business } = await createBusinessWithRealOwner({
      businessName: `Rewards Stamps ${suffix}`,
      slug: `rewards-stamps-${suffix}`,
      ownerEmail: `rewards-stamps-owner-${suffix}@test.dev`,
      ownerPassword: password,
      createdByAuthUserId: platformAdminAuthUserId,
    });
    businessId = business.id;

    const jar = await signInAsCookieJar(`rewards-stamps-owner-${suffix}@test.dev`, password);
    const s = await requireTenantSession(jar);
    if (!s) throw new Error("sesión de tenant inválida en el setup");
    session = s;

    const programResult = await saveProgramForSession(
      session,
      form({ name: "Programa", stampsRequired: "8", cooldownMinutes: "0", isActive: "on" }),
    );
    if (!programResult.success) throw new Error(`setup programa: ${programResult.error}`);
  });

  afterAll(async () => {
    await adminDb.delete(rewardRules).where(eq(rewardRules.businessId, businessId));
    await adminDb.delete(loyaltyPrograms).where(eq(loyaltyPrograms.businessId, businessId));
  });

  it("rechaza crear una recompensa con más sellos que el programa (10 > 8), sin crear fila", async () => {
    const result = await saveRewardRuleForSession(
      session,
      form({ name: "Demasiado cara", stampsRequired: "10" }),
    );
    expect(result.error).toBe(
      "El número de sellos de una recompensa no puede superar los sellos del ciclo completo (8).",
    );
    const rows = await adminDb.select().from(rewardRules).where(eq(rewardRules.businessId, businessId));
    expect(rows.find((r) => r.name === "Demasiado cara")).toBeUndefined();
  });

  it("permite crear una recompensa con exactamente el mismo costo que el programa (8)", async () => {
    const result = await saveRewardRuleForSession(
      session,
      form({ name: "Recompensa final", stampsRequired: "8" }),
    );
    expect(result.success).toBeTruthy();
    const [row] = await adminDb
      .select()
      .from(rewardRules)
      .where(eq(rewardRules.businessId, businessId));
    expect(row.stampsRequired).toBe(8);
  });

  it("permite crear una recompensa intermedia con menos sellos que el programa (multi-nivel real)", async () => {
    const result = await saveRewardRuleForSession(
      session,
      form({ name: "Recompensa chica", stampsRequired: "4" }),
    );
    expect(result.success).toBeTruthy();
  });

  it("rechaza editar una recompensa existente para que supere el programa, sin tocar la fila", async () => {
    const [existing] = await adminDb
      .select()
      .from(rewardRules)
      .where(eq(rewardRules.businessId, businessId));

    const result = await saveRewardRuleForSession(
      session,
      form({ ruleId: existing.id, name: existing.name, stampsRequired: "9" }),
    );
    expect(result.error).toBe(
      "El número de sellos de una recompensa no puede superar los sellos del ciclo completo (8).",
    );
    const [unchanged] = await adminDb
      .select()
      .from(rewardRules)
      .where(eq(rewardRules.id, existing.id));
    expect(unchanged.stampsRequired).toBe(existing.stampsRequired);
  });
});
