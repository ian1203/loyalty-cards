import { CreditCardIcon, DatabaseIcon, SmartphoneIcon, TagsIcon, TrendingUpIcon, UserRoundSearchIcon } from "lucide-react";
import { PROBLEM_POINTS } from "../../../lib/marketing/content";
import { DashboardGlance } from "./DashboardGlance";
import { PhoneFrame } from "./PhoneFrame";
import { RevealOnScroll } from "./RevealOnScroll";
import { WalletCardMockup } from "./WalletCardMockup";

const ICONS = [CreditCardIcon, TagsIcon, UserRoundSearchIcon, TrendingUpIcon, DatabaseIcon, SmartphoneIcon];

// Fusión de lo que antes eran dos secciones separadas (ProblemSection +
// ProductShowcase, ver CLAUDE.md "UNIFICAR") — el problema (tarjeta física)
// y la prueba visual del producto ahora comparten un solo fondo/padding en
// vez de pagar dos veces py-20/28. Sigue siendo el ÚNICO bloque navy
// full-bleed de toda la página (regla que traía ProblemSection original).
export function ProductAndProblem() {
  return (
    <section id="producto" className="scroll-mt-20 bg-primary py-20 text-primary-foreground sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.85fr_1.2fr] lg:gap-16">
          <RevealOnScroll>
            <h2 className="max-w-lg text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              La tarjeta física ya no alcanza.
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1">
              {PROBLEM_POINTS.map((point, i) => {
                const Icon = ICONS[i % ICONS.length];
                return (
                  <div key={point} className="flex items-start gap-3.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10">
                      <Icon className="size-4 text-stamp" aria-hidden="true" />
                    </span>
                    <p className="pt-1.5 text-primary-foreground/85">{point}</p>
                  </div>
                );
              })}
            </div>
          </RevealOnScroll>

          <RevealOnScroll delayMs={100}>
            <h3 className="text-lg font-semibold">Lo que tu cliente ve. Lo que tú ves.</h3>
            <p className="mt-2 max-w-sm text-primary-foreground/80">
              Tu cliente guarda la tarjeta en su teléfono y ve su progreso en tiempo real. Tú ves, del otro lado,
              quién regresa y cuándo.
            </p>
            <div className="relative mt-8 flex items-center justify-center py-4">
              <div className="absolute right-0 top-6 hidden -rotate-3 opacity-95 sm:right-4 sm:block lg:right-0">
                <DashboardGlance />
              </div>
              <div className="relative z-10 -translate-x-2 rotate-[-2deg] sm:-translate-x-6 lg:-translate-x-16">
                <PhoneFrame>
                  <WalletCardMockup compact />
                </PhoneFrame>
              </div>
            </div>
            <div className="mt-6 flex justify-center sm:hidden">
              <DashboardGlance />
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
