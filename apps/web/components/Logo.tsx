import Image from "next/image";
import { cn } from "../lib/utils";

// Identidad Pragmia: el ícono es la "P" con el motivo de círculos
// concéntricos + diamante (pragmia-logo/icon.jpeg, aprobado en el chat).
// Es un PNG procesado (fondo recortado a transparente vía flood-fill,
// nunca un color plano — la marca tiene detalle real de dos tonos dentro
// del trazo) en vez de un trazado SVG a mano: el motivo interior
// (anillos+diamante+punto) no son primitivas simples, así que vectorizar
// a ojo arriesgaba desviarse del arte aprobado. A los tamaños reales de
// uso (ícono de sidebar ~28px, favicon) un PNG de alta resolución escala
// sin pérdida visible — no hay ganancia real de nitidez que justifique el
// riesgo de una réplica imprecisa a mano.
export function LogoMark({
  className,
  tone = "default",
}: {
  className?: string;
  /** "on-primary": variante en blanco, para fondos --primary (ej. el
      header del WalletCardMockup) — el ícono es azul sólido, así que
      sobre --primary (también azul) se vuelve casi invisible. */
  tone?: "default" | "on-primary";
}) {
  return (
    <span className={cn("relative inline-block size-7 shrink-0", className)}>
      <Image
        src={tone === "on-primary" ? "/brand/pragmia-icon-white.png" : "/brand/pragmia-icon.png"}
        alt=""
        fill
        sizes="32px"
        className="object-contain"
        priority
      />
    </span>
  );
}

export function Logo({
  className,
  iconClassName,
  wordmarkClassName,
}: {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("size-7", iconClassName)} />
      <span
        className={cn(
          "font-display text-lg font-bold tracking-tight text-foreground whitespace-nowrap",
          wordmarkClassName,
        )}
      >
        PRAGMIA
      </span>
    </span>
  );
}
