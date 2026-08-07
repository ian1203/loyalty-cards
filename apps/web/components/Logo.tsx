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

// Logo principal de nav/chrome: el lockup completo (wordmark "PRAGMIA" +
// ícono, ya integrados en el arte aprobado — pragmia-logo/logo.jpeg,
// recortado a la fila del wordmark, sin la tagline) como UNA sola imagen.
// A propósito NO se compone acá (LogoMark + texto por separado): eso
// duplicaba el ícono con una relación de tamaño/espaciado distinta a la
// del lockup real. LogoMark queda reservado para el favicon y el ícono
// chico dentro de las tarjetas de muestra — nunca junto al wordmark.
const WORDMARK_ASPECT = 1430 / 297;

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/pragmia-wordmark.png"
      alt="Pragmia"
      width={1430}
      height={297}
      priority
      className={cn("h-7 w-auto", className)}
      style={{ aspectRatio: WORDMARK_ASPECT }}
    />
  );
}
