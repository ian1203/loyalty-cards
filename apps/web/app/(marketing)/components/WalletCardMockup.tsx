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
            <LogoMark className="size-6 shrink-0" tone="on-primary" />
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
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <DemoQr className="size-10 shrink-0 text-foreground/70" />
            <p className="text-[0.6875rem] text-muted-foreground">Hecho con Pragmia</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// QR estático de demo — SVG pre-generado (librería `qrcode`, offline, una
// sola vez) codificando un string de marca fijo, nunca datos reales ni un
// wallet_token: esta tarjeta es un mockup de marketing, no un pase real.
// Inline en vez de un <img>: cero request, cero asset que servir.
function DemoQr({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" shapeRendering="crispEdges" className={className} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        d="M0 0.5h7m1 0h3m3 0h7M0 1.5h1m5 0h1m3 0h2m2 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m2 0h1m1 0h2m1 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h3m3 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h1m1 0h3m1 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h1m3 0h1m1 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h2M0 8.5h1m3 0h1m1 0h4m2 0h6m2 0h1M0 9.5h2m1 0h1m3 0h2m3 0h1m2 0h2m1 0h3M4 10.5h3m1 0h1m3 0h1m1 0h1m1 0h1m1 0h1M1 11.5h1m3 0h1m3 0h6m2 0h2M1 12.5h3m1 0h2m4 0h1m2 0h2m3 0h1M8 13.5h1m1 0h1m1 0h1m2 0h1m1 0h4M0 14.5h7m1 0h2m1 0h1m1 0h1m2 0h2m1 0h2M0 15.5h1m5 0h1m2 0h1m1 0h2m2 0h1m2 0h1M0 16.5h1m1 0h3m1 0h1m1 0h1m4 0h2m1 0h2m1 0h1M0 17.5h1m1 0h3m1 0h1m3 0h3m1 0h2m1 0h1m1 0h2M0 18.5h1m1 0h3m1 0h1m2 0h4m3 0h2M0 19.5h1m5 0h1m2 0h6m2 0h1m2 0h1M0 20.5h7m1 0h1m1 0h2m1 0h1m1 0h2m1 0h3"
      />
    </svg>
  );
}
