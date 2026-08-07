import { SparklesIcon, WalletIcon } from "lucide-react";
import { BENEFITS } from "../../../lib/marketing/content";
import { ComingSoonBadge } from "./ComingSoonBadge";
import { RevealOnScroll } from "./RevealOnScroll";

// Bento asimétrico (1 celda grande + 2 apiladas) en vez de 3 tarjetas
// blancas idénticas — la celda grande usa el marino de marca (variación
// real de fondo, no las 3 igual sobre hueso) y un patrón de puntos que
// ecoa la fila de sellos, no un patrón decorativo genérico.
export function ComponentsBento() {
  const [main, ...rest] = BENEFITS;
  if (!main) return null;

  return (
    <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <RevealOnScroll>
        <h2 className="max-w-lg text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Todo lo que necesita tu programa de lealtad
        </h2>
      </RevealOnScroll>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2">
        <RevealOnScroll className="md:col-span-2 md:row-span-2">
          <div
            className="relative flex h-full flex-col justify-end overflow-hidden rounded-2xl bg-primary p-8 text-primary-foreground"
            style={{
              backgroundImage: "radial-gradient(rgb(255 255 255 / 0.12) 1.5px, transparent 1.5px)",
              backgroundSize: "18px 18px",
              backgroundPosition: "-9px -9px",
            }}
          >
            <WalletIcon className="mb-6 size-9 text-stamp" aria-hidden="true" />
            <h3 className="text-xl font-semibold">{main.title}</h3>
            <p className="mt-2 max-w-sm text-primary-foreground/80">{main.description}</p>
          </div>
        </RevealOnScroll>
        {rest.map((benefit, i) => (
          <RevealOnScroll key={benefit.title} delayMs={(i + 1) * 80}>
            <div className="flex h-full flex-col rounded-2xl border bg-card p-6">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
                  <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
                </span>
                {benefit.comingSoon ? <ComingSoonBadge /> : null}
              </div>
              <h3 className="mt-4 text-base font-semibold">{benefit.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{benefit.description}</p>
            </div>
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}
