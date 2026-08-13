import type { ReactNode } from "react";

// Marco de teléfono en CSS puro (bordes + Dynamic Island), no una foto de
// stock de un iPhone. Envuelve <WalletCardMockup> en ProductAndProblem
// para mostrar el pase "instalado" en Wallet, no solo flotando sobre la
// página. La píldora va con margen real arriba y a los lados (top-6, no
// top-2 pegado al padding-box del frame) — estilo iPhone 14 Pro+ con
// Dynamic Island integrada en el bisel, no un notch cortado en el borde
// mismo del frame (hallazgo real: con top-2 la píldora se veía mordida
// por la esquina redondeada del frame).
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-[260px] rounded-[2.5rem] border-[6px] border-primary bg-primary p-2 shadow-token-lg sm:w-[280px]">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-6 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-primary"
      />
      <div className="overflow-hidden rounded-[2rem] bg-background px-3 pb-6 pt-10">{children}</div>
    </div>
  );
}
