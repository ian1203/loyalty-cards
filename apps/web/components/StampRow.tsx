import { CheckIcon } from "lucide-react";
import { stampProgress } from "@loyalty/core";
import { cn } from "../lib/utils";

// El motivo de firma del sistema "Sello": progreso como fila de sellos
// circulares, nunca una barra genérica — reemplaza StampProgressBar.tsx.
// stampProgress() (packages/core) ya resuelve el clamp/completed; acá solo
// se dibuja.
export function StampRow({
  current,
  required,
  className,
}: {
  current: number;
  required: number;
  className?: string;
}) {
  const { displayStamps, completed } = stampProgress(current, required);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="img" aria-label={`${current} de ${required} sellos`}>
      {Array.from({ length: required }, (_, i) => {
        const filled = i < displayStamps;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              filled
                ? completed
                  ? "border-success bg-success text-success-foreground"
                  : "border-stamp bg-stamp text-stamp-foreground"
                : "border-border bg-transparent",
            )}
          >
            {filled ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
          </span>
        );
      })}
    </div>
  );
}
