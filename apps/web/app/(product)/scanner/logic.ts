// OJO: este archivo NO lleva "use server" — mismo motivo que en /rewards y
// /customers: estas funciones reciben la sesión como parámetro y en un
// archivo "use server" quedarían expuestas como endpoints invocables con
// una sesión forjada. Solo actions.ts (que resuelve la sesión desde cookies
// verificadas) y los tests las llaman.
//
// Este es el camino de escritura más sensible de la plataforma: sellar y
// canjear. Toda regla de negocio corre ACÁ, server-side, dentro de una
// transacción con lock — la UI solo refleja.
import {
  applyRedemption,
  applyStamp,
  availableRewards,
  evaluateRedemption,
  evaluateStamp,
  stampProgress,
  type StampProgress,
} from "@loyalty/core";
import { and, asc, eq } from "drizzle-orm";
import {
  businesses,
  customerBalances,
  customers,
  employees,
  locations,
  loyaltyPrograms,
  redemptions,
  rewardRules,
  rewards,
  transactions,
  users,
  withTenantContext,
  type TenantTransaction,
} from "@loyalty/db";
import {
  findInTenant,
  isUuid,
  writeAuditLog,
  type TenantSession,
} from "../../../lib/tenant";
import { checkRateLimit } from "../../../lib/rateLimit";
import { notifyWalletOfTransaction } from "../../../lib/wallet/notify";
import { scheduleAfterResponse } from "../../../lib/wallet/scheduleAfterResponse";

// ---------------------------------------------------------------------------
// Rate limiting del lookup (anti-enumeración de tokens)
// ---------------------------------------------------------------------------
// El espacio del token (24 bytes aleatorios) ya hace la enumeración
// inviable; esto es defensa en profundidad. En memoria, por instancia de
// proceso — suficiente para el MVP single-node; si algún día hay múltiples
// instancias, mover a Redis/DB (documentado en el plan de Fase 3).

const LOOKUP_WINDOW_MS = 10_000;
const LOOKUP_MAX_PER_WINDOW = 30;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_MAX_PER_WINDOW = 10;
const BLOCK_MS = 60_000;

// Sellado: mismo espíritu que el lookup de arriba, contador separado (son
// acciones distintas). Pre-filtro barato de un solo proceso — el chequeo
// real cross-instancia es checkRateLimit("scanner_stamp_employee"/
// "scanner_stamp_business", ...) contra Upstash, ver lib/rateLimit.ts.
const STAMP_WINDOW_MS = 60_000;
const STAMP_MAX_PER_WINDOW = 60;

const lookupTimestamps = new Map<string, number[]>();
const failureTimestamps = new Map<string, number[]>();
const blockedUntil = new Map<string, number>();
const stampTimestamps = new Map<string, number[]>();

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter((t) => now - t < windowMs);
}

// Barrido periódico (hallazgo BAJO de la revisión): sin esto, las entradas
// de usuarios sin actividad reciente quedan en los Maps para siempre en un
// proceso de larga vida. Se dispara de forma oportunista desde el check.
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweepAt = 0;

function sweepStaleEntries(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, timestamps] of lookupTimestamps) {
    if (prune(timestamps, LOOKUP_WINDOW_MS, now).length === 0) {
      lookupTimestamps.delete(key);
    }
  }
  for (const [key, timestamps] of failureTimestamps) {
    if (prune(timestamps, FAILURE_WINDOW_MS, now).length === 0) {
      failureTimestamps.delete(key);
    }
  }
  for (const [key, until] of blockedUntil) {
    if (now >= until) {
      blockedUntil.delete(key);
    }
  }
  for (const [key, timestamps] of stampTimestamps) {
    if (prune(timestamps, STAMP_WINDOW_MS, now).length === 0) {
      stampTimestamps.delete(key);
    }
  }
}

export function checkLookupRateLimit(
  authUserId: string,
  now: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  sweepStaleEntries(now);
  const blocked = blockedUntil.get(authUserId);
  if (blocked !== undefined && now < blocked) {
    return { allowed: false, retryAfterSeconds: Math.ceil((blocked - now) / 1000) };
  }

  const recent = prune(lookupTimestamps.get(authUserId) ?? [], LOOKUP_WINDOW_MS, now);
  if (recent.length >= LOOKUP_MAX_PER_WINDOW) {
    blockedUntil.set(authUserId, now + BLOCK_MS);
    return { allowed: false, retryAfterSeconds: Math.ceil(BLOCK_MS / 1000) };
  }

  recent.push(now);
  lookupTimestamps.set(authUserId, recent);
  return { allowed: true };
}

export function recordLookupFailure(
  authUserId: string,
  now: number = Date.now(),
): void {
  const recent = prune(failureTimestamps.get(authUserId) ?? [], FAILURE_WINDOW_MS, now);
  recent.push(now);
  failureTimestamps.set(authUserId, recent);
  if (recent.length >= FAILURE_MAX_PER_WINDOW) {
    blockedUntil.set(authUserId, now + BLOCK_MS);
  }
}

export function checkStampRateLimit(
  authUserId: string,
  now: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  sweepStaleEntries(now);
  const recent = prune(stampTimestamps.get(authUserId) ?? [], STAMP_WINDOW_MS, now);
  if (recent.length >= STAMP_MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil(STAMP_WINDOW_MS / 1000) };
  }
  recent.push(now);
  stampTimestamps.set(authUserId, recent);
  return { allowed: true };
}

// Solo para tests: el estado es a nivel de módulo.
export function resetLookupRateLimiter(): void {
  lookupTimestamps.clear();
  failureTimestamps.clear();
  blockedUntil.clear();
  stampTimestamps.clear();
}

// Piso duro entre sellos del mismo cliente, independiente del cooldown
// configurable por programa (que puede estar fijado más bajo) — medida
// temporal de endurecimiento hasta que exista un cap de 1 sello/día.
const MIN_STAMP_GAP_SECONDS = 30;

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export type ScannerRewardOption = {
  id: string;
  name: string;
  description: string | null;
  stampsRequired: number;
  available: boolean;
};

export type ScannerCustomerView = {
  customer: { id: string; fullName: string | null; phone: string | null };
  program: { id: string; name: string; isActive: boolean; stampsRequired: number };
  progress: StampProgress;
  rewardOptions: ScannerRewardOption[];
};

export type ScannerResult =
  | { ok: true; view: ScannerCustomerView; replayed?: boolean; message?: string }
  | { ok: false; error: string; code?: "cooldown" | "rate_limited"; retryAt?: string };

// ---------------------------------------------------------------------------
// Errores internos tipados (mensaje claro vs. fallo inesperado)
// ---------------------------------------------------------------------------

class OperationRejectedError extends Error {
  constructor(
    readonly userMessage: string,
    readonly code?: "cooldown",
    readonly retryAt?: Date,
  ) {
    super(userMessage);
  }
}

// El canje detectó un replay DESPUÉS de insertar la fila de rewards: hay que
// abortar la transacción (revierte ese insert) y responder como replay.
class ReplayDetectedError extends Error {}

// ---------------------------------------------------------------------------
// Contexto operativo: revocación fresca + sucursal validada
// ---------------------------------------------------------------------------

type OperationContext = {
  actor: typeof users.$inferSelect;
  employee: typeof employees.$inferSelect | null;
  location: typeof locations.$inferSelect;
};

// Implementa la decisión de revocación de CLAUDE.md: en operaciones
// sensibles (sellar/canjear) el claim del JWT NO basta — se verifica contra
// la DB, en el momento de la acción y dentro de la misma transacción:
// negocio activo, usuario activo, empleado activo (si tiene ficha), y
// sucursal existente/activa/asignada. El location_id del JWT nunca se usa:
// la sucursal la selecciona el operador y se valida acá.
async function requireOperationContext(
  tx: TenantTransaction,
  session: TenantSession,
  locationId: string,
): Promise<OperationContext> {
  // Nota: AMBOS roles de plataforma impersonan con acceso completo,
  // incluido sellar/canjear — ver el comentario en resolveActor()
  // (apps/web/lib/tenant.ts) para el razonamiento completo.
  const [business] = await tx
    .select({ status: businesses.status })
    .from(businesses)
    .where(eq(businesses.id, session.businessId))
    .limit(1);
  if (!business || business.status !== "active") {
    throw new OperationRejectedError(
      "El negocio está suspendido — no se pueden registrar operaciones.",
    );
  }

  const [actor] = await tx
    .select()
    .from(users)
    .where(
      and(
        eq(users.authUserId, session.authUserId),
        eq(users.businessId, session.businessId),
      ),
    )
    .limit(1);
  if (!actor || !actor.isActive) {
    throw new OperationRejectedError(
      "Tu usuario está desactivado — no puedes registrar operaciones.",
    );
  }

  const [employee] = await tx
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.userId, actor.id),
        eq(employees.businessId, session.businessId),
      ),
    )
    .orderBy(asc(employees.createdAt))
    .limit(1);
  if (employee && !employee.isActive) {
    throw new OperationRejectedError(
      "Tu ficha de empleado está desactivada — no puedes registrar operaciones.",
    );
  }

  const location = await findInTenant(tx, session, locations, locationId);
  if (!location || !location.isActive) {
    throw new OperationRejectedError("La sucursal seleccionada no es válida.");
  }
  // Asignación: ficha de empleado con sucursal primaria fijada → debe
  // coincidir. Sin sucursal primaria (o sin ficha — el dueño) → cualquier
  // sucursal activa del negocio.
  if (employee?.primaryLocationId && employee.primaryLocationId !== location.id) {
    throw new OperationRejectedError(
      "No estás asignado a esa sucursal — selecciona la tuya.",
    );
  }

  return { actor, employee: employee ?? null, location };
}

// ---------------------------------------------------------------------------
// Vista del cliente (compartida por lookup / sellar / canjear)
// ---------------------------------------------------------------------------

async function getTenantProgram(tx: TenantTransaction, session: TenantSession) {
  const [program] = await tx
    .select()
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.businessId, session.businessId))
    .orderBy(asc(loyaltyPrograms.createdAt))
    .limit(1);
  return program ?? null;
}

async function buildCustomerView(
  tx: TenantTransaction,
  session: TenantSession,
  customer: { id: string; fullName: string | null; phone: string | null },
  program: typeof loyaltyPrograms.$inferSelect,
): Promise<ScannerCustomerView> {
  const [balance] = await tx
    .select()
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.businessId, session.businessId),
        eq(customerBalances.customerId, customer.id),
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
        eq(rewardRules.businessId, session.businessId),
        eq(rewardRules.loyaltyProgramId, program.id),
        eq(rewardRules.isActive, true),
      ),
    )
    .orderBy(asc(rewardRules.stampsRequired));
  const availableIds = new Set(availableRewards(currentStamps, rules).map((r) => r.id));

  return {
    customer: { id: customer.id, fullName: customer.fullName, phone: customer.phone },
    program: {
      id: program.id,
      name: program.name,
      isActive: program.isActive,
      stampsRequired: program.stampsRequired,
    },
    progress: stampProgress(currentStamps, program.stampsRequired),
    rewardOptions: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      stampsRequired: rule.stampsRequired,
      available: availableIds.has(rule.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// Lookup por token (QR / lector USB)
// ---------------------------------------------------------------------------

// wallet_token: 24 bytes aleatorios en base64url (32 chars). Se valida la
// FORMA antes de tocar la DB; los tokens de test/seed pueden ser más cortos,
// así que el rango es laxo pero acotado.
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

export async function lookupCustomerByTokenForSession(
  session: TenantSession | null,
  rawToken: string,
): Promise<ScannerResult> {
  if (!session) {
    return { ok: false, error: "No autorizado." };
  }

  const rate = checkLookupRateLimit(session.authUserId);
  if (!rate.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiados escaneos seguidos — espera ${rate.retryAfterSeconds}s.`,
    };
  }

  // Chequeo cross-instancia (Upstash) detrás del pre-filtro en memoria de
  // arriba — dos ejes independientes, empleado y negocio (ver lib/rateLimit.ts).
  const employeeRate = await checkRateLimit("scanner_lookup_employee", session.authUserId);
  if (!employeeRate.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiados escaneos seguidos — espera ${employeeRate.retryAfterSeconds}s.`,
    };
  }
  const businessRate = await checkRateLimit("scanner_lookup_business", session.businessId);
  if (!businessRate.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiados escaneos seguidos en tu negocio — espera ${businessRate.retryAfterSeconds}s.`,
    };
  }

  const token = rawToken.trim();
  if (!TOKEN_RE.test(token)) {
    // Forma inválida = mismo mensaje que un token inexistente (sin oráculo),
    // y cuenta como fallo para el limitador.
    recordLookupFailure(session.authUserId);
    return { ok: false, error: "Cliente no encontrado." };
  }

  try {
    return await withTenantContext(session.businessId, async (tx) => {
      // Un negocio suspendido no opera el scanner en absoluto.
      const [business] = await tx
        .select({ status: businesses.status })
        .from(businesses)
        .where(eq(businesses.id, session.businessId))
        .limit(1);
      if (!business || business.status !== "active") {
        return {
          ok: false as const,
          error: "El negocio está suspendido — no se pueden registrar operaciones.",
        };
      }

      const program = await getTenantProgram(tx, session);
      if (!program) {
        return {
          ok: false as const,
          error: "Primero configura el programa de sellos en /rewards.",
        };
      }

      // Token de un cliente de OTRO negocio → null, idéntico a inexistente.
      const [customer] = await tx
        .select({
          id: customers.id,
          fullName: customers.fullName,
          phone: customers.phone,
        })
        .from(customers)
        .where(
          and(
            eq(customers.walletToken, token),
            eq(customers.businessId, session.businessId),
          ),
        )
        .limit(1);
      if (!customer) {
        recordLookupFailure(session.authUserId);
        return { ok: false as const, error: "Cliente no encontrado." };
      }

      const view = await buildCustomerView(tx, session, customer, program);
      return { ok: true as const, view };
    });
  } catch (error) {
    console.error("lookupCustomerByTokenForSession:", error);
    return { ok: false, error: "No se pudo buscar el cliente. Intenta de nuevo." };
  }
}

// Fallback manual: mismo lookup pero por id (elegido de la búsqueda por
// nombre/teléfono/email, que reutiliza searchCustomers de /customers).
export async function lookupCustomerByIdForSession(
  session: TenantSession | null,
  customerId: string,
): Promise<ScannerResult> {
  if (!session) {
    return { ok: false, error: "No autorizado." };
  }

  try {
    return await withTenantContext(session.businessId, async (tx) => {
      const program = await getTenantProgram(tx, session);
      if (!program) {
        return {
          ok: false as const,
          error: "Primero configura el programa de sellos en /rewards.",
        };
      }
      const customer = await findInTenant(tx, session, customers, customerId);
      if (!customer) {
        return { ok: false as const, error: "Cliente no encontrado." };
      }
      const view = await buildCustomerView(tx, session, customer, program);
      return { ok: true as const, view };
    });
  } catch (error) {
    console.error("lookupCustomerByIdForSession:", error);
    return { ok: false, error: "No se pudo buscar el cliente. Intenta de nuevo." };
  }
}

// ---------------------------------------------------------------------------
// Registrar sello
// ---------------------------------------------------------------------------

export type StampInput = {
  customerId: string;
  locationId: string;
  idempotencyKey: string;
};

export async function registerStampForSession(
  session: TenantSession | null,
  input: StampInput,
): Promise<ScannerResult> {
  if (!session) {
    return { ok: false, error: "No autorizado." };
  }
  if (!isUuid(input.customerId) || !isUuid(input.locationId) || !isUuid(input.idempotencyKey)) {
    return { ok: false, error: "Solicitud inválida." };
  }

  const stampPreFilter = checkStampRateLimit(session.authUserId);
  if (!stampPreFilter.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiados sellos seguidos — espera ${stampPreFilter.retryAfterSeconds}s.`,
    };
  }
  const stampEmployeeRate = await checkRateLimit("scanner_stamp_employee", session.authUserId);
  if (!stampEmployeeRate.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiados sellos seguidos — espera ${stampEmployeeRate.retryAfterSeconds}s.`,
    };
  }
  const stampBusinessRate = await checkRateLimit("scanner_stamp_business", session.businessId);
  if (!stampBusinessRate.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiados sellos seguidos en tu negocio — espera ${stampBusinessRate.retryAfterSeconds}s.`,
    };
  }

  try {
    const result = await withTenantContext(session.businessId, async (tx) => {
      const ctx = await requireOperationContext(tx, session, input.locationId);

      const customer = await findInTenant(tx, session, customers, input.customerId);
      if (!customer) {
        return { ok: false as const, error: "Cliente no encontrado." };
      }
      const program = await getTenantProgram(tx, session);
      if (!program) {
        return {
          ok: false as const,
          error: "Primero configura el programa de sellos en /rewards.",
        };
      }

      // Asegurar el balance (clientes nacidos antes que el programa) y
      // tomar el LOCK que serializa todo lo que sigue por cliente+programa.
      await tx
        .insert(customerBalances)
        .values({
          businessId: session.businessId,
          customerId: customer.id,
          loyaltyProgramId: program.id,
        })
        .onConflictDoNothing();
      const [balance] = await tx
        .select()
        .from(customerBalances)
        .where(
          and(
            eq(customerBalances.businessId, session.businessId),
            eq(customerBalances.customerId, customer.id),
            eq(customerBalances.loyaltyProgramId, program.id),
          ),
        )
        .for("update");

      // Replay-check bajo el lock, ANTES del cooldown: un reintento de un
      // sello exitoso debe devolver el resultado original — no un error de
      // cooldown provocado por el propio sello que registró (bug real que
      // atrapó el smoke test: el primer sello fija last_stamp_at y el replay
      // caía en la ventana).
      const [existing] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.businessId, session.businessId),
            eq(transactions.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        const view = await buildCustomerView(tx, session, customer, program);
        return {
          ok: true as const,
          view,
          replayed: true,
          message: "Sello ya registrado (reintento detectado).",
        };
      }

      const now = new Date();
      // Piso duro, temporal hasta el cap de 1/día: convive con (no
      // reemplaza) el cooldown configurable por programa — nunca lo acorta,
      // solo eleva un cooldown más corto que MIN_STAMP_GAP_SECONDS.
      const decision = evaluateStamp({
        programActive: program.isActive,
        cooldownSeconds: Math.max(program.cooldownSeconds, MIN_STAMP_GAP_SECONDS),
        lastStampAt: balance.lastStampAt,
        now,
      });
      if (!decision.allowed) {
        if (decision.reason === "cooldown") {
          const waitSeconds = Math.ceil(
            (decision.retryAt.getTime() - now.getTime()) / 1000,
          );
          throw new OperationRejectedError(
            `Sello reciente ya registrado — espera ${formatWait(waitSeconds)}.`,
            "cooldown",
            decision.retryAt,
          );
        }
        throw new OperationRejectedError("El programa de sellos está pausado.");
      }

      // El UNIQUE (business_id, idempotency_key) es el backstop del caso en
      // que la misma key llegue por un lock DISTINTO (otro cliente): el
      // replay-check de arriba no la vio, pero el INSERT hace conflicto.
      const inserted = await tx
        .insert(transactions)
        .values({
          businessId: session.businessId,
          customerId: customer.id,
          loyaltyProgramId: program.id,
          locationId: ctx.location.id,
          employeeId: ctx.employee?.id ?? null,
          type: "stamp",
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });

      if (inserted.length === 0) {
        const view = await buildCustomerView(tx, session, customer, program);
        return {
          ok: true as const,
          view,
          replayed: true,
          message: "Sello ya registrado (reintento detectado).",
        };
      }

      const newStamps = applyStamp(balance.currentStamps);
      await tx
        .update(customerBalances)
        .set({ currentStamps: newStamps, lastStampAt: now })
        .where(
          and(
            eq(customerBalances.id, balance.id),
            eq(customerBalances.businessId, session.businessId),
          ),
        );

      await writeAuditLog(tx, session, ctx.actor.id, {
        action: "stamp.registered",
        entityType: "customer",
        entityId: customer.id,
        metadata: {
          transactionId: inserted[0].id,
          newStamps,
          programId: program.id,
        },
        actorEmployeeId: ctx.employee?.id,
        locationId: ctx.location.id,
      });

      const view = await buildCustomerView(tx, session, customer, program);
      return { ok: true as const, view, message: "Sello registrado." };
    });

    // Hook post-transacción (paso g de Fase 4): fuera de withTenantContext
    // — la transacción YA confirmó, así que un push que falle nunca puede
    // revertir el sello. Nunca en un replay (no hubo cambio real que
    // notificar) ni en un rechazo de regla de negocio. after() (next/server)
    // garantiza que el proceso no mate el push antes de que termine, a
    // diferencia de un fire-and-forget suelto.
    if (result.ok && !result.replayed) {
      scheduleAfterResponse(() => notifyWalletOfTransaction(session.businessId, input.customerId));
    }
    return result;
  } catch (error) {
    if (error instanceof OperationRejectedError) {
      return {
        ok: false,
        error: error.userMessage,
        code: error.code,
        retryAt: error.retryAt?.toISOString(),
      };
    }
    console.error("registerStampForSession:", error);
    return { ok: false, error: "No se pudo registrar el sello. Intenta de nuevo." };
  }
}

// ---------------------------------------------------------------------------
// Canjear recompensa
// ---------------------------------------------------------------------------

export type RedeemInput = {
  customerId: string;
  ruleId: string;
  locationId: string;
  idempotencyKey: string;
};

export async function redeemRewardForSession(
  session: TenantSession | null,
  input: RedeemInput,
): Promise<ScannerResult> {
  if (!session) {
    return { ok: false, error: "No autorizado." };
  }
  if (
    !isUuid(input.customerId) ||
    !isUuid(input.ruleId) ||
    !isUuid(input.locationId) ||
    !isUuid(input.idempotencyKey)
  ) {
    return { ok: false, error: "Solicitud inválida." };
  }

  try {
    const result = await withTenantContext(session.businessId, async (tx) => {
      const ctx = await requireOperationContext(tx, session, input.locationId);

      const customer = await findInTenant(tx, session, customers, input.customerId);
      if (!customer) {
        return { ok: false as const, error: "Cliente no encontrado." };
      }
      // Regla de OTRO negocio → mismo mensaje que inexistente (sin oráculo).
      const rule = await findInTenant(tx, session, rewardRules, input.ruleId);
      if (!rule) {
        return { ok: false as const, error: "La recompensa no existe." };
      }
      const [program] = await tx
        .select()
        .from(loyaltyPrograms)
        .where(
          and(
            eq(loyaltyPrograms.id, rule.loyaltyProgramId),
            eq(loyaltyPrograms.businessId, session.businessId),
          ),
        )
        .limit(1);
      if (!program || !program.isActive) {
        return { ok: false as const, error: "El programa de sellos está pausado." };
      }

      await tx
        .insert(customerBalances)
        .values({
          businessId: session.businessId,
          customerId: customer.id,
          loyaltyProgramId: program.id,
        })
        .onConflictDoNothing();
      const [balance] = await tx
        .select()
        .from(customerBalances)
        .where(
          and(
            eq(customerBalances.businessId, session.businessId),
            eq(customerBalances.customerId, customer.id),
            eq(customerBalances.loyaltyProgramId, program.id),
          ),
        )
        .for("update");

      // Replay-check bajo el lock: el lock por cliente serializa los canjes
      // del mismo cliente, así que si la key ya existe, es un reintento.
      const [existing] = await tx
        .select({ id: redemptions.id })
        .from(redemptions)
        .where(
          and(
            eq(redemptions.businessId, session.businessId),
            eq(redemptions.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        const view = await buildCustomerView(tx, session, customer, program);
        return {
          ok: true as const,
          view,
          replayed: true,
          message: "Canje ya registrado (reintento detectado).",
        };
      }

      const decision = evaluateRedemption({
        currentStamps: balance.currentStamps,
        ruleActive: rule.isActive,
        ruleCost: rule.stampsRequired,
      });
      if (!decision.allowed) {
        if (decision.reason === "insufficient_stamps") {
          throw new OperationRejectedError(
            `Sellos insuficientes — faltan ${decision.missing}.`,
          );
        }
        throw new OperationRejectedError("Esa recompensa está desactivada.");
      }

      // Instancia de recompensa creada AL CANJEAR (decisión del plan): la
      // fila en rewards nace ya redimida; redemptions la referencia.
      const [rewardRow] = await tx
        .insert(rewards)
        .values({
          businessId: session.businessId,
          customerId: customer.id,
          loyaltyProgramId: program.id,
          rewardRuleId: rule.id,
          status: "redeemed",
        })
        .returning({ id: rewards.id });

      // Backstop del caso rarísimo (misma key desde OTRO cliente — lock
      // distinto): el UNIQUE decide; si no insertó, abortamos para revertir
      // la fila de rewards y respondemos como replay.
      const redemptionInserted = await tx
        .insert(redemptions)
        .values({
          businessId: session.businessId,
          rewardId: rewardRow.id,
          locationId: ctx.location.id,
          employeeId: ctx.employee?.id ?? null,
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing()
        .returning({ id: redemptions.id });
      if (redemptionInserted.length === 0) {
        throw new ReplayDetectedError();
      }

      const newStamps = applyRedemption(balance.currentStamps, rule.stampsRequired);
      await tx
        .update(customerBalances)
        .set({ currentStamps: newStamps, cycleStartedAt: new Date() })
        .where(
          and(
            eq(customerBalances.id, balance.id),
            eq(customerBalances.businessId, session.businessId),
          ),
        );

      await writeAuditLog(tx, session, ctx.actor.id, {
        action: "reward.redeemed",
        entityType: "customer",
        entityId: customer.id,
        metadata: {
          rewardId: rewardRow.id,
          redemptionId: redemptionInserted[0].id,
          ruleId: rule.id,
          ruleName: rule.name,
          stampsSpent: rule.stampsRequired,
          newStamps,
        },
        actorEmployeeId: ctx.employee?.id,
        locationId: ctx.location.id,
      });

      const view = await buildCustomerView(tx, session, customer, program);
      return {
        ok: true as const,
        view,
        message: `Canjeado: ${rule.name}.`,
      };
    });

    // Mismo hook que registerStampForSession (paso g de Fase 4) — fuera de
    // la transacción, solo en un canje genuino (nunca en un replay).
    if (result.ok && !result.replayed) {
      scheduleAfterResponse(() => notifyWalletOfTransaction(session.businessId, input.customerId));
    }
    return result;
  } catch (error) {
    if (error instanceof ReplayDetectedError) {
      // La transacción se revirtió (incluida la fila de rewards); el estado
      // actual se lee en una transacción nueva.
      return lookupCustomerByIdForSession(session, input.customerId).then((result) =>
        result.ok
          ? { ...result, replayed: true, message: "Canje ya registrado (reintento detectado)." }
          : result,
      );
    }
    if (error instanceof OperationRejectedError) {
      return {
        ok: false,
        error: error.userMessage,
        code: error.code,
        retryAt: error.retryAt?.toISOString(),
      };
    }
    console.error("redeemRewardForSession:", error);
    return { ok: false, error: "No se pudo canjear. Intenta de nuevo." };
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}
