import { cn } from "../lib/utils";

// La marca de "Sello": dos círculos superpuestos, como una tarjeta de
// sellos a medio estampar — el mismo motivo que <StampRow> usa para
// progreso real, acá reducido a su forma más simple. Colores por CSS var
// (hereda el tema; no hace falta una versión aparte para dark mode).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="13" cy="13" r="10.25" fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      <circle cx="21" cy="21" r="6.5" fill="var(--stamp)" />
    </svg>
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
      <LogoMark className={cn("size-7 shrink-0", iconClassName)} />
      <span
        className={cn(
          "font-display text-lg font-bold tracking-tight text-foreground whitespace-nowrap",
          wordmarkClassName,
        )}
      >
        Pragmia
      </span>
    </span>
  );
}
