// Motor de lealtad — funciones PURAS, sin I/O, sin dependencias. La capa de
// datos (apps/web/app/scanner/logic.ts) le pasa el estado leído bajo lock y
// aplica lo que el motor decide; el motor jamás toca la DB ni el reloj (el
// `now` siempre entra como parámetro — determinismo total para los tests).
//
// Modelo (CLAUDE.md): SELLOS por visita. Cada visita = +1 sello, sin tope —
// los sellos representan visitas reales y no se descartan. El canje
// descuenta el costo de la regla canjeada y ARRASTRA el sobrante (decisión
// de Fase 3: resetear a 0 castigaría al cliente que visitó entre llenar la
// tarjeta y canjear, y contradiría el ledger de transactions donde cada
// sello es una fila).

export type StampEvaluationInput = {
  programActive: boolean;
  cooldownSeconds: number;
  lastStampAt: Date | null;
  now: Date;
};

export type StampEvaluation =
  | { allowed: true }
  | { allowed: false; reason: "program_inactive" }
  | { allowed: false; reason: "cooldown"; retryAt: Date };

// ¿Se puede registrar un sello ahora? El cooldown se mide contra el último
// sello REGISTRADO (last_stamp_at): un intento dentro de la ventana se
// rechaza sin efectos. lastStampAt null = primer sello, siempre permitido
// (si el programa está activo).
export function evaluateStamp(input: StampEvaluationInput): StampEvaluation {
  if (!input.programActive) {
    return { allowed: false, reason: "program_inactive" };
  }

  if (input.cooldownSeconds > 0 && input.lastStampAt !== null) {
    const retryAt = new Date(
      input.lastStampAt.getTime() + input.cooldownSeconds * 1000,
    );
    if (input.now.getTime() < retryAt.getTime()) {
      return { allowed: false, reason: "cooldown", retryAt };
    }
  }

  return { allowed: true };
}

// +1 sello. Sin tope: el balance puede superar stamps_required legítimamente
// (visitas entre llenar la tarjeta y canjear — no hay auto-canje).
export function applyStamp(currentStamps: number): number {
  assertNonNegativeInt(currentStamps, "currentStamps");
  return currentStamps + 1;
}

export type RewardRuleInput = {
  isActive: boolean;
  stampsRequired: number;
};

// Reglas canjeables AHORA con el balance actual: activas y con costo
// alcanzado. La "recompensa disponible" es computada, nunca persistida —
// la instancia en la tabla rewards se crea recién al canjear.
export function availableRewards<T extends RewardRuleInput>(
  currentStamps: number,
  rules: readonly T[],
): T[] {
  assertNonNegativeInt(currentStamps, "currentStamps");
  return rules.filter(
    (rule) => rule.isActive && rule.stampsRequired <= currentStamps,
  );
}

// Cuántos canjes REALES puede hacer el cliente ahora mismo — distinto de
// availableRewards().length (que cuenta reglas DISTINTAS desbloqueadas,
// como máximo una vez cada una, sin importar cuánto exceda el balance su
// costo). applyRedemption arrastra el sobrante y permite canjes
// consecutivos de la MISMA regla si el balance alcanza (12 sellos con una
// regla de costo 6 → 2 canjes reales, uno tras otro) — este número
// refleja eso: floor(currentStamps / costo) sumado por cada regla activa.
export function countAvailableRedemptions<T extends RewardRuleInput>(
  currentStamps: number,
  rules: readonly T[],
): number {
  assertNonNegativeInt(currentStamps, "currentStamps");
  return rules.reduce(
    (sum, rule) => (rule.isActive ? sum + Math.floor(currentStamps / rule.stampsRequired) : sum),
    0,
  );
}

// Progreso dentro del CICLO ACTUAL — currentStamps % stampsRequired, con
// un caso especial: un múltiplo exacto del requisito (6, 12, 18...) se
// muestra como CICLO COMPLETO (stampsRequired), nunca como 0 vacío — un
// cliente con exactamente 6 sellos (o 12, o 18) no debe ver su tarjeta en
// blanco. A diferencia de stampProgress() (que clampea el TOTAL
// acumulado a un máximo visual — sigue usándose tal cual para la barra
// del dashboard, que sí puede comunicar "más de un ciclo" con texto),
// esta función responde "¿cuánto llevo del ciclo que estoy llenando
// ahora?" — la única pregunta que el grid físico de un pase de Wallet
// puede representar, porque no tiene espacio para ciclos ya completados.
export function cycleStampProgress(currentStamps: number, stampsRequired: number): number {
  assertNonNegativeInt(currentStamps, "currentStamps");
  assertPositiveInt(stampsRequired, "stampsRequired");
  const remainder = currentStamps % stampsRequired;
  return remainder === 0 && currentStamps > 0 ? stampsRequired : remainder;
}

// Sellos faltantes para la próxima recompensa AÚN NO desbloqueada —
// distinto de cycleStampProgress (progreso del ciclo del PROGRAMA, no de
// una regla específica: dos negocios podrían tener reglas con costo menor
// al ciclo completo). Toma la regla activa más barata cuyo stampsRequired
// sea ESTRICTAMENTE mayor a currentStamps; null si no hay ninguna
// pendiente (sin reglas activas, o currentStamps ya alcanza/supera todas
// — en ese caso ya puede canjear, "faltante" no aplica).
export function stampsUntilNextReward<T extends RewardRuleInput>(
  currentStamps: number,
  rules: readonly T[],
): number | null {
  assertNonNegativeInt(currentStamps, "currentStamps");
  const upcoming = rules.filter((rule) => rule.isActive && rule.stampsRequired > currentStamps);
  if (upcoming.length === 0) {
    return null;
  }
  const cheapest = upcoming.reduce((min, rule) => (rule.stampsRequired < min.stampsRequired ? rule : min));
  return cheapest.stampsRequired - currentStamps;
}

export type RedemptionEvaluationInput = {
  currentStamps: number;
  ruleActive: boolean;
  ruleCost: number;
};

export type RedemptionEvaluation =
  | { allowed: true }
  | { allowed: false; reason: "rule_inactive" }
  | { allowed: false; reason: "insufficient_stamps"; missing: number };

export function evaluateRedemption(
  input: RedemptionEvaluationInput,
): RedemptionEvaluation {
  assertNonNegativeInt(input.currentStamps, "currentStamps");
  assertPositiveInt(input.ruleCost, "ruleCost");

  if (!input.ruleActive) {
    return { allowed: false, reason: "rule_inactive" };
  }
  if (input.currentStamps < input.ruleCost) {
    return {
      allowed: false,
      reason: "insufficient_stamps",
      missing: input.ruleCost - input.currentStamps,
    };
  }
  return { allowed: true };
}

// Descuenta el costo y arrastra el sobrante. Solo llamar tras un
// evaluateRedemption permitido — descontar por debajo de cero es un bug del
// caller, no un estado válido, y acá revienta en vez de devolver negativo
// (la DB además lo rechazaría: CHECK current_stamps >= 0).
export function applyRedemption(currentStamps: number, ruleCost: number): number {
  assertNonNegativeInt(currentStamps, "currentStamps");
  assertPositiveInt(ruleCost, "ruleCost");
  if (currentStamps < ruleCost) {
    throw new Error(
      "applyRedemption llamado con sellos insuficientes — evalúa antes con evaluateRedemption.",
    );
  }
  return currentStamps - ruleCost;
}

export type StampProgress = {
  currentStamps: number;
  stampsRequired: number;
  // Acotado a [0, stampsRequired] para UI de progreso; currentStamps puede
  // superarlo (arrastre) y la barra se muestra llena.
  displayStamps: number;
  completed: boolean;
};

export function stampProgress(
  currentStamps: number,
  stampsRequired: number,
): StampProgress {
  assertNonNegativeInt(currentStamps, "currentStamps");
  assertPositiveInt(stampsRequired, "stampsRequired");
  return {
    currentStamps,
    stampsRequired,
    displayStamps: Math.min(currentStamps, stampsRequired),
    completed: currentStamps >= stampsRequired,
  };
}

function assertNonNegativeInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} debe ser un entero >= 0 (recibido: ${value}).`);
  }
}

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero >= 1 (recibido: ${value}).`);
  }
}
