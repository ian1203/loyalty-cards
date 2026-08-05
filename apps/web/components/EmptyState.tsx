import type { ReactNode } from "react";
import { cn } from "../lib/utils";

// Ilustración propia (no stock): una tarjeta de sellos a medio llenar,
// mismo motivo que <StampRow>/<LogoMark> — coherente con el resto del
// sistema en vez de un ícono genérico.
function EmptyCardIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden="true">
      <rect x="4" y="4" width="112" height="72" rx="12" fill="none" stroke="var(--border)" strokeWidth="2" strokeDasharray="6 5" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={24 + i * 18}
          cy={40}
          r="7"
          fill={i < 2 ? "var(--stamp)" : "none"}
          stroke={i < 2 ? "none" : "var(--border)"}
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
      <EmptyCardIllustration className="h-16 w-24" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
