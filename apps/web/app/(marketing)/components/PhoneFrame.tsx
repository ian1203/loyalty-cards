import type { ReactNode } from "react";

// Marco de teléfono en CSS puro (bordes + notch), no una foto de stock de
// un iPhone. Envuelve <WalletCardMockup> en ProductAndProblem para mostrar
// el pase "instalado" en Wallet, no solo flotando sobre la página.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-[260px] rounded-[2.5rem] border-[6px] border-primary bg-primary p-2 shadow-token-lg sm:w-[280px]">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-primary"
      />
      <div className="overflow-hidden rounded-[2rem] bg-background px-3 pb-6 pt-8">{children}</div>
    </div>
  );
}
