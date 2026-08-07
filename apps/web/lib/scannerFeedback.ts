// Feedback multisensorial del scanner (vibración + tono corto) para
// confirmar un resultado sin que el empleado tenga que fijar la vista en la
// pantalla. Mismo criterio de "degradar con elegancia" que
// useOnlineStatus.ts: cada API del navegador se envuelve en su propio guard
// try/catch y nunca se asume presente — iOS Safari no implementa
// navigator.vibrate en absoluto (con o sin permiso), así que ahí esto
// simplemente no hace nada, nunca revienta el flujo de sellado/canje real.
export type ScanFeedbackKind = "success" | "reward" | "cooldown" | "error";

const VIBRATION_PATTERNS: Record<ScanFeedbackKind, number | number[]> = {
  success: 40,
  reward: [30, 60, 30, 60, 30],
  cooldown: [25, 70, 25],
  error: [80, 60, 80],
};

export function triggerHapticFeedback(kind: ScanFeedbackKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(VIBRATION_PATTERNS[kind]);
  } catch {
    // Best-effort: algunos navegadores exponen vibrate pero lo rechazan si
    // no hay un gesto de usuario reciente — nunca debe romper el flujo.
  }
}

// Tono corto vía Web Audio — sin asset de audio ni dependencia nueva. Un
// solo AudioContext reusado por proceso (crear uno por tono agotaría el
// límite de contextos concurrentes de algunos navegadores).
type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

const TONE_SPECS: Record<ScanFeedbackKind, Array<{ freq: number; start: number; duration: number }>> = {
  success: [{ freq: 880, start: 0, duration: 0.11 }],
  reward: [
    { freq: 660, start: 0, duration: 0.09 },
    { freq: 990, start: 0.1, duration: 0.16 },
  ],
  cooldown: [{ freq: 520, start: 0, duration: 0.14 }],
  error: [{ freq: 220, start: 0, duration: 0.2 }],
};

export function playFeedbackTone(kind: ScanFeedbackKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    for (const { freq, start, duration } of TONE_SPECS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }
  } catch {
    // Best-effort — un tono que falla nunca debe bloquear el flujo real.
  }
}
