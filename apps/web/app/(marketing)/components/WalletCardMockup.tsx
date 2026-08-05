import { LogoMark } from "../../../components/Logo";

// El "visual de producto" del hero — un mockup CSS/SVG del pase real que
// termina en el Wallet del cliente, no una foto de stock. Reusa el mismo
// motivo de sello (fila de círculos) que <StampRow> en el producto, para
// que la landing y el dashboard se sientan construidos con el mismo
// sistema, no dos marcas distintas.
export function WalletCardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* Segunda tarjeta asomando atrás — profundidad de "pila de pases",
          sin exagerar: un solo elemento decorativo, no una colección. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 -top-3 h-full rounded-2xl bg-primary/10"
      />
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-token-lg">
        <div className="flex items-center gap-2.5 bg-primary px-5 py-4 text-primary-foreground">
          <LogoMark className="size-6 shrink-0 [&_circle:first-child]:stroke-white" />
          <div>
            <p className="text-sm font-semibold leading-tight">Café Central</p>
            <p className="text-xs text-primary-foreground/70">Tarjeta de sellos</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Progreso</p>
            <p className="text-sm font-medium">7 de 10 sellos</p>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={
                  i < 7
                    ? "flex size-6 items-center justify-center rounded-full border-2 border-stamp bg-stamp text-stamp-foreground"
                    : "flex size-6 items-center justify-center rounded-full border-2 border-border"
                }
              >
                {i < 7 ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Próxima recompensa</p>
            <p className="text-sm font-medium">Café gratis</p>
          </div>
        </div>
      </div>
    </div>
  );
}
