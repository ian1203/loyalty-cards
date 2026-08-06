import { CreditCardIcon, DatabaseIcon, SmartphoneIcon, TagsIcon, TrendingUpIcon, UserRoundSearchIcon } from "lucide-react";
import { PROBLEM_POINTS } from "../../../lib/marketing/content";
import { RevealOnScroll } from "./RevealOnScroll";

const ICONS = [CreditCardIcon, TagsIcon, UserRoundSearchIcon, TrendingUpIcon, DatabaseIcon, SmartphoneIcon];

// Rompe la monotonía de tarjetas blancas sobre fondo hueso con un único
// bloque a color completo (marino de marca) — el mismo device que usan
// Stripe/Linear para marcar una sección como distinta sin salirse de la
// marca. Aparece UNA sola vez en la página (ver design-taste-frontend:
// "page theme lock" es sobre light/dark de sistema, no sobre bloques de
// color de marca dentro de una página clara).
export function ProblemSection() {
  return (
    <section className="bg-primary py-20 text-primary-foreground sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <RevealOnScroll>
          <h2 className="max-w-lg text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            La tarjeta física ya no alcanza.
          </h2>
        </RevealOnScroll>
        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {PROBLEM_POINTS.map((point, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <RevealOnScroll key={point} delayMs={i * 60} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10">
                  <Icon className="size-4 text-stamp" aria-hidden="true" />
                </span>
                <p className="pt-1.5 text-primary-foreground/85">{point}</p>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}
