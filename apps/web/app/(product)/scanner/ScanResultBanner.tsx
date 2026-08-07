"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  ClockIcon,
  PartyPopperIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { ScanFeedbackKind } from "../../../lib/scannerFeedback";
import { cn } from "../../../lib/utils";

// Mismo set de estados que ScanFeedbackKind (vibración/tono) — un solo
// resultado de scanner nunca necesita divergir entre "qué se ve" y "qué se
// siente/oye", así que reusa el tipo en vez de duplicar el union.
export type ScanResultKind = ScanFeedbackKind;

type Props = {
  kind: ScanResultKind;
  title: string;
  description?: string | null;
  onReset: () => void;
  resetLabel?: string;
  // null = sin auto-reset (se usa para "reward": el empleado necesita el
  // panel abierto para tocar Canjear, no queremos que desaparezca solo).
  autoResetMs?: number | null;
};

const KIND_STYLES: Record<
  ScanResultKind,
  { container: string; icon: typeof CheckCircle2Icon; iconClass: string }
> = {
  success: {
    container: "border-success bg-success/10",
    icon: CheckCircle2Icon,
    iconClass: "text-success",
  },
  reward: {
    // El tinte de fondo se queda en celeste (--stamp) — es solo relleno,
    // sin requisito de contraste. El borde y el ícono usan --primary: un
    // celeste al 100% ahí falla contraste vs. el fondo claro de la página
    // (~1.9:1, ver plan de tokens Pragmia en globals.css).
    container: "border-primary bg-stamp/10",
    icon: PartyPopperIcon,
    iconClass: "text-primary",
  },
  cooldown: {
    container: "border-warning bg-warning/10",
    icon: ClockIcon,
    iconClass: "text-warning",
  },
  error: {
    container: "border-destructive bg-destructive/10",
    icon: XCircleIcon,
    iconClass: "text-destructive",
  },
};

// Resultado grande a pantalla, pensado para leerse de un vistazo desde
// distancia de brazo (tablet de mostrador): ícono + color + texto — nunca
// solo color (a11y). role="alert" en error (interrumpe, WAI-ARIA); el resto
// usa "status" (anuncia sin interrumpir). El auto-reset es cancelable: un
// tap en cualquier parte del botón grande lo dispara de inmediato.
//
// OJO al montar este componente: el padre debe pasar una `key` distinta por
// cada resultado nuevo (ver ScannerClient — `resultId`). El countdown se
// reinicia por REMOUNT, no por un efecto que reaccione a props — evita
// tanto un `setState` síncrono en el cuerpo del efecto (lint
// react-hooks/set-state-in-effect) como depender de `onReset`, que el padre
// recrea en cada render.
export function ScanResultBanner({
  kind,
  title,
  description,
  onReset,
  resetLabel = "Siguiente cliente",
  autoResetMs = 3500,
}: Props) {
  const style = KIND_STYLES[kind];
  const Icon = style.icon;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    autoResetMs ? Math.ceil(autoResetMs / 1000) : null,
  );

  useEffect(() => {
    if (!autoResetMs) return;
    const tickMs = 250;
    const deadline = Date.now() + autoResetMs;
    const interval = window.setInterval(() => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        window.clearInterval(interval);
        onReset();
        return;
      }
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, tickMs);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a propósito: onReset cambia de identidad cada render del padre; este efecto corre UNA vez por montaje (la key del padre garantiza un montaje nuevo por resultado), no debe reiniciar el timer si onReset se recrea sin que cambie el resultado.
  }, [autoResetMs]);

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 px-5 py-6 text-center",
        style.container,
      )}
    >
      <Icon className={cn("size-12 shrink-0", style.iconClass)} aria-hidden="true" strokeWidth={2} />
      <div className="flex flex-col gap-1">
        <p className="text-xl font-display font-semibold tracking-tight text-foreground">{title}</p>
        {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
      </div>
      <Button
        type="button"
        onClick={onReset}
        size="lg"
        className="h-12 w-full max-w-xs text-base font-semibold"
      >
        <RotateCcwIcon className="size-4" />
        {resetLabel}
        {secondsLeft !== null ? (
          <span className="text-primary-foreground/70 font-normal">({secondsLeft}s)</span>
        ) : null}
      </Button>
    </div>
  );
}
