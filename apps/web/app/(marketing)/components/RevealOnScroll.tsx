"use client";

import type { ReactNode } from "react";
import { useInView } from "../../../lib/useInView";

// Isla cliente aislada (ver skill design-taste-frontend: RSC safety) sobre
// una página estática — el resto de la landing sigue siendo ○ Static en
// next build, esto no le agrega "use client" a nada más.
export function RevealOnScroll({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-visible={inView}
      className={`reveal${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: delayMs ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  );
}
