import { BarChart3Icon, QrCodeIcon, ScanLineIcon, SparklesIcon, TagIcon, WalletIcon } from "lucide-react";
import { HOW_IT_WORKS } from "../../../lib/marketing/content";
import { ComingSoonBadge } from "./ComingSoonBadge";
import { RevealOnScroll } from "./RevealOnScroll";

const ICONS = [QrCodeIcon, WalletIcon, ScanLineIcon, TagIcon, BarChart3Icon, SparklesIcon];

// "Cómo funciona" como una fila de sellos conectados, no tarjetas
// numeradas genéricas — el mismo motivo visual que <StampRow> en el
// producto y que la tarjeta del hero: un sello lleno = ya funciona hoy, un
// sello punteado = próximamente. Conecta la explicación con el objeto
// real detrás del producto en vez de una fila de "Step 1/2/3" abstracta.
export function HowItWorksStamps() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <RevealOnScroll>
        <h2 className="max-w-lg text-3xl font-bold tracking-tight text-balance sm:text-4xl">Cómo funciona</h2>
      </RevealOnScroll>
      <div className="mt-14 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:flex lg:gap-0">
        {HOW_IT_WORKS.map((step, i) => {
          const Icon = ICONS[i % ICONS.length];
          const isLast = i === HOW_IT_WORKS.length - 1;
          return (
            <RevealOnScroll
              key={step.step}
              delayMs={i * 70}
              className="relative flex flex-col items-center gap-3 px-2 text-center lg:flex-1"
            >
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-6 hidden h-px w-full bg-border lg:block"
                />
              ) : null}
              <span
                className={
                  step.comingSoon
                    ? "relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-background"
                    : "relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-stamp bg-stamp text-stamp-foreground"
                }
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="w-full min-w-0">
                <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm font-semibold">
                  {step.title}
                  {step.comingSoon ? <ComingSoonBadge /> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              </div>
            </RevealOnScroll>
          );
        })}
      </div>
    </section>
  );
}
