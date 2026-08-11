import { describe, expect, it } from "vitest";
import {
  applyRedemption,
  applyStamp,
  availableRewards,
  countAvailableRedemptions,
  cycleStampProgress,
  evaluateRedemption,
  evaluateStamp,
  stampProgress,
} from "./loyalty";

const T0 = new Date("2026-07-30T12:00:00.000Z");

function secondsAfter(base: Date, seconds: number): Date {
  return new Date(base.getTime() + seconds * 1000);
}

describe("evaluateStamp — cooldown y estado del programa", () => {
  it("programa inactivo rechaza siempre, incluso sin sello previo", () => {
    const result = evaluateStamp({
      programActive: false,
      cooldownSeconds: 0,
      lastStampAt: null,
      now: T0,
    });
    expect(result).toEqual({ allowed: false, reason: "program_inactive" });
  });

  it("primer sello (lastStampAt null) siempre permitido con programa activo", () => {
    const result = evaluateStamp({
      programActive: true,
      cooldownSeconds: 3600,
      lastStampAt: null,
      now: T0,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("cooldown 0 permite sellos consecutivos inmediatos", () => {
    const result = evaluateStamp({
      programActive: true,
      cooldownSeconds: 0,
      lastStampAt: T0,
      now: T0,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("dentro de la ventana (1s antes de cumplirse) rechaza con retryAt exacto", () => {
    const result = evaluateStamp({
      programActive: true,
      cooldownSeconds: 1800,
      lastStampAt: T0,
      now: secondsAfter(T0, 1799),
    });
    expect(result).toEqual({
      allowed: false,
      reason: "cooldown",
      retryAt: secondsAfter(T0, 1800),
    });
  });

  it("EXACTAMENTE al cumplirse el cooldown, permite (límite inclusivo)", () => {
    const result = evaluateStamp({
      programActive: true,
      cooldownSeconds: 1800,
      lastStampAt: T0,
      now: secondsAfter(T0, 1800),
    });
    expect(result).toEqual({ allowed: true });
  });

  it("1s después de cumplirse, permite", () => {
    const result = evaluateStamp({
      programActive: true,
      cooldownSeconds: 1800,
      lastStampAt: T0,
      now: secondsAfter(T0, 1801),
    });
    expect(result).toEqual({ allowed: true });
  });

  it("intento en el MISMO instante del último sello rechaza (ventana completa por delante)", () => {
    const result = evaluateStamp({
      programActive: true,
      cooldownSeconds: 60,
      lastStampAt: T0,
      now: T0,
    });
    expect(result).toEqual({
      allowed: false,
      reason: "cooldown",
      retryAt: secondsAfter(T0, 60),
    });
  });

  it("programa inactivo gana sobre el cooldown (se reporta la causa raíz)", () => {
    const result = evaluateStamp({
      programActive: false,
      cooldownSeconds: 60,
      lastStampAt: T0,
      now: T0,
    });
    expect(result).toEqual({ allowed: false, reason: "program_inactive" });
  });
});

describe("applyStamp", () => {
  it("suma exactamente 1", () => {
    expect(applyStamp(0)).toBe(1);
    expect(applyStamp(7)).toBe(8);
  });

  it("no hay tope: puede superar stamps_required (arrastre en canje)", () => {
    expect(applyStamp(100)).toBe(101);
  });

  it("rechaza negativos y no-enteros", () => {
    expect(() => applyStamp(-1)).toThrow();
    expect(() => applyStamp(1.5)).toThrow();
  });
});

describe("availableRewards", () => {
  const rules = [
    { id: "a", isActive: true, stampsRequired: 5 },
    { id: "b", isActive: true, stampsRequired: 8 },
    { id: "c", isActive: false, stampsRequired: 3 },
  ];

  it("solo reglas activas con costo alcanzado", () => {
    expect(availableRewards(5, rules).map((r) => r.id)).toEqual(["a"]);
  });

  it("umbral inclusivo: costo == sellos cuenta", () => {
    expect(availableRewards(8, rules).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("inactivas nunca aparecen aunque el costo alcance", () => {
    expect(availableRewards(100, rules).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("con 0 sellos, nada disponible", () => {
    expect(availableRewards(0, rules)).toEqual([]);
  });
});

describe("evaluateRedemption", () => {
  it("permite con sellos exactos (límite inclusivo)", () => {
    expect(
      evaluateRedemption({ currentStamps: 8, ruleActive: true, ruleCost: 8 }),
    ).toEqual({ allowed: true });
  });

  it("rechaza por insuficiencia con el faltante exacto", () => {
    expect(
      evaluateRedemption({ currentStamps: 5, ruleActive: true, ruleCost: 8 }),
    ).toEqual({ allowed: false, reason: "insufficient_stamps", missing: 3 });
  });

  it("regla inactiva rechaza aunque los sellos alcancen", () => {
    expect(
      evaluateRedemption({ currentStamps: 20, ruleActive: false, ruleCost: 8 }),
    ).toEqual({ allowed: false, reason: "rule_inactive" });
  });

  it("costo inválido (0, negativo, no-entero) revienta", () => {
    expect(() =>
      evaluateRedemption({ currentStamps: 5, ruleActive: true, ruleCost: 0 }),
    ).toThrow();
    expect(() =>
      evaluateRedemption({ currentStamps: 5, ruleActive: true, ruleCost: -1 }),
    ).toThrow();
    expect(() =>
      evaluateRedemption({ currentStamps: 5, ruleActive: true, ruleCost: 2.5 }),
    ).toThrow();
  });
});

describe("applyRedemption — arrastre de sobrantes", () => {
  it("descuenta el costo y conserva el resto", () => {
    expect(applyRedemption(10, 8)).toBe(2);
  });

  it("sellos exactos dejan 0", () => {
    expect(applyRedemption(8, 8)).toBe(0);
  });

  it("el sobrante arrastrado puede volver a alcanzar otra recompensa", () => {
    // 17 sellos, canjea una de 8 → quedan 9 → alcanza otra de 8.
    const remaining = applyRedemption(17, 8);
    expect(remaining).toBe(9);
    expect(
      evaluateRedemption({ currentStamps: remaining, ruleActive: true, ruleCost: 8 }),
    ).toEqual({ allowed: true });
  });

  it("insuficiencia revienta (el caller debió evaluar antes)", () => {
    expect(() => applyRedemption(5, 8)).toThrow(/insuficientes/);
  });
});

describe("stampProgress", () => {
  it("progreso normal", () => {
    expect(stampProgress(4, 6)).toEqual({
      currentStamps: 4,
      stampsRequired: 6,
      displayStamps: 4,
      completed: false,
    });
  });

  it("completo exacto", () => {
    expect(stampProgress(6, 6)).toEqual({
      currentStamps: 6,
      stampsRequired: 6,
      displayStamps: 6,
      completed: true,
    });
  });

  it("con arrastre por encima del umbral, display se acota y sigue completo", () => {
    expect(stampProgress(9, 6)).toEqual({
      currentStamps: 9,
      stampsRequired: 6,
      displayStamps: 6,
      completed: true,
    });
  });

  it("stampsRequired inválido revienta", () => {
    expect(() => stampProgress(1, 0)).toThrow();
  });
});

describe("countAvailableRedemptions — canjes REALES posibles, no reglas distintas desbloqueadas", () => {
  const oneRule = [{ isActive: true, stampsRequired: 6 }];

  it("por debajo del costo, cero canjes", () => {
    expect(countAvailableRedemptions(4, oneRule)).toBe(0);
  });

  it("exactamente el costo, un canje", () => {
    expect(countAvailableRedemptions(6, oneRule)).toBe(1);
  });

  it("caso real de Carlo (8 sellos, límite 6): un canje, no dos — floor(8/6)=1", () => {
    expect(countAvailableRedemptions(8, oneRule)).toBe(1);
  });

  it("dos ciclos completos exactos (12 sellos, límite 6): DOS canjes — a diferencia de availableRewards().length, que se quedaría en 1", () => {
    expect(countAvailableRedemptions(12, oneRule)).toBe(2);
    expect(availableRewards(12, oneRule).length).toBe(1);
  });

  it("suma entre varias reglas activas", () => {
    const rules = [
      { isActive: true, stampsRequired: 3 }, // floor(10/3) = 3
      { isActive: true, stampsRequired: 6 }, // floor(10/6) = 1
    ];
    expect(countAvailableRedemptions(10, rules)).toBe(4);
  });

  it("regla inactiva no cuenta", () => {
    const rules = [{ isActive: false, stampsRequired: 3 }];
    expect(countAvailableRedemptions(12, rules)).toBe(0);
  });
});

describe("cycleStampProgress — progreso del ciclo ACTUAL, nunca se congela en el máximo", () => {
  it("por debajo del requisito, es el total tal cual", () => {
    expect(cycleStampProgress(4, 6)).toBe(4);
  });

  it("exactamente el requisito: ciclo completo, no vacío", () => {
    expect(cycleStampProgress(6, 6)).toBe(6);
  });

  it("caso real de Carlo (8 sellos, límite 6): progreso del ciclo nuevo, no el grid congelado en 6", () => {
    expect(cycleStampProgress(8, 6)).toBe(2);
  });

  it("múltiplo exacto de más de un ciclo (12): ciclo completo, no 0 vacío", () => {
    expect(cycleStampProgress(12, 6)).toBe(6);
  });

  it("múltiplo exacto de tres ciclos (18): sigue siendo ciclo completo", () => {
    expect(cycleStampProgress(18, 6)).toBe(6);
  });

  it("cero sellos: cero, no ciclo completo (el caso especial exige currentStamps > 0)", () => {
    expect(cycleStampProgress(0, 6)).toBe(0);
  });

  it("stampsRequired inválido revienta", () => {
    expect(() => cycleStampProgress(1, 0)).toThrow();
  });
});
