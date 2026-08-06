import { LogoMark } from "../../../components/Logo";

export type WalletCardMockupProps = {
  businessName?: string;
  rewardLabel?: string;
  stampsFilled?: number;
  stampsRequired?: number;
  /** Color de acento hex (ej. "#E8573F"). Sin definir, usa --stamp de marca. */
  accentColor?: string;
  /** Object URL/data URL generado en el navegador (ver CardPreviewer) — nunca una URL remota. */
  logoSrc?: string;
  className?: string;
  /** Sin la segunda tarjeta asomando atrás ni max-width propio — para anidar dentro de <PhoneFrame>. */
  compact?: boolean;
};

// El "visual de producto" del hero (y del previsualizador client-side en
// PART 2) — un mockup CSS/SVG del pase real que termina en el Wallet del
// cliente, no una foto de stock. Reusa el mismo motivo de sello (fila de
// círculos) que <StampRow> en el producto, para que la landing y el
// dashboard se sientan construidos con el mismo sistema. Parametrizado
// (antes hardcoded "Café Central") para que el previsualizador reuse este
// mismo componente con los datos que el prospecto capture, en vez de
// duplicar el marcado del pase en dos lugares.
export function WalletCardMockup({
  businessName = "Café Central",
  rewardLabel = "Café gratis",
  stampsFilled = 7,
  stampsRequired = 10,
  accentColor,
  logoSrc,
  className,
  compact = false,
}: WalletCardMockupProps) {
  const filled = Math.max(0, Math.min(stampsFilled, stampsRequired));
  const accentStyle = accentColor ? ({ "--stamp": accentColor } as React.CSSProperties) : undefined;

  return (
    <div
      className={`relative${compact ? "" : " mx-auto w-full max-w-sm"}${className ? ` ${className}` : ""}`}
      style={accentStyle}
    >
      {/* Segunda tarjeta asomando atrás — profundidad de "pila de pases",
          sin exagerar: un solo elemento decorativo, no una colección.
          Se omite en compact (dentro de <PhoneFrame>, ya tiene su propio marco). */}
      {compact ? null : (
        <div aria-hidden="true" className="absolute inset-x-6 -top-3 h-full rounded-2xl bg-primary/10" />
      )}
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-token-lg">
        <div className="flex items-center gap-2.5 bg-primary px-5 py-4 text-primary-foreground">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL en memoria, nunca sale del navegador (ver CardPreviewer); next/image exige un loader remoto que no aplica aquí.
            <img
              src={logoSrc}
              alt=""
              className="size-6 shrink-0 rounded-full border border-white/40 bg-white object-contain"
            />
          ) : (
            <LogoMark className="size-6 shrink-0 [&_circle:first-child]:stroke-white" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{businessName}</p>
            <p className="text-xs text-primary-foreground/70">Tarjeta de sellos</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Progreso</p>
            <p className="text-sm font-medium">
              {filled} de {stampsRequired} sellos
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-hidden="true">
            {Array.from({ length: stampsRequired }, (_, i) => (
              <span
                key={i}
                className={
                  i < filled
                    ? "flex size-6 items-center justify-center rounded-full border-2 border-stamp bg-stamp text-stamp-foreground"
                    : "flex size-6 items-center justify-center rounded-full border-2 border-border"
                }
              >
                {i < filled ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
            ))}
          </div>
          <div
            className={
              compact
                ? "flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2.5"
                : "flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5"
            }
          >
            <p className="whitespace-nowrap text-xs text-muted-foreground">Próxima recompensa</p>
            <p className="truncate text-sm font-medium">{rewardLabel || "Recompensa"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
