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
//
// max-w-7xl (no max-w-5xl como el resto de la página, a propósito): el
// celular (~300px) y la tarjeta de dashboard (~380px) necesitan ~700px
// lado a lado SIN solaparse — con max-w-5xl (1024px) el contenido
// disponible en el viewport más angosto donde arranca el layout de 2
// columnas (justo 1024px) es de solo 976px, insuficiente para eso más una
// columna de texto legible (verificado con Playwright: a 1024px con
// max-w-5xl no hay forma de que ambas piezas quepan completas sin
// recortarse una a la otra). Ver la sección "< xl" abajo para el rango
// donde tampoco alcanza ni con más ancho.
export function ProductAndProblem() {
  return (
    <section id="producto" className="scroll-mt-20 bg-primary py-20 text-primary-foreground sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-center gap-12 xl:grid-cols-[1fr_1.5fr] xl:gap-16">
          <RevealOnScroll>
            <h2 className="max-w-lg text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              La tarjeta física ya no alcanza.
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-1">
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

            {/* < xl: mismo criterio que mobile — apilados, flujo normal,
                cero overlap por construcción (nunca hay espacio suficiente
                para mostrar ambos lado a lado sin solape antes de xl). */}
            <div className="mt-8 flex flex-col items-center gap-6 xl:hidden">
              <PhoneFrame>
                <WalletCardMockup compact />
              </PhoneFrame>
              <DashboardGlance />
            </div>

            {/* >= xl: lado a lado en flujo normal (flex + gap), NO
                absolute+overlap — cero riesgo de que uno tape al otro
                porque ya no dependen de que el offset numérico alcance
                justo la separación correcta. La ligera rotación de cada
                uno es solo visual (transform no mueve la caja en el
                flujo). */}
            <div className="mt-8 hidden items-center justify-center gap-8 xl:flex">
              <div className="relative z-10 rotate-[-2deg]">
                <PhoneFrame>
                  <WalletCardMockup compact />
                </PhoneFrame>
              </div>
              <div className="-rotate-3 opacity-95">
                <DashboardGlance />
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
