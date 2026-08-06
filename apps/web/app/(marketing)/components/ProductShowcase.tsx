import { PhoneFrame } from "./PhoneFrame";
import { DashboardGlance } from "./DashboardGlance";
import { WalletCardMockup } from "./WalletCardMockup";
import { RevealOnScroll } from "./RevealOnScroll";

// La sección que MUESTRA el producto (ver brief): la tarjeta instalada en
// un teléfono real y, asomando detrás en diagonal, el dashboard que el
// dueño del negocio ve del otro lado. Layout family propia (composición
// de imagen en capas), distinta de cualquier otra sección de la página —
// no es un split imagen/texto más.
export function ProductShowcase() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <RevealOnScroll>
          <h2 className="max-w-md text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Lo que tu cliente ve. Lo que tú ves.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Tu cliente guarda la tarjeta en su teléfono y ve su progreso en tiempo real. Tú ves, del otro lado,
            quién regresa y cuándo.
          </p>
        </RevealOnScroll>
        <RevealOnScroll delayMs={100} className="relative">
          <div className="relative flex items-center justify-center py-4">
            <div className="absolute right-0 top-6 hidden -rotate-3 opacity-95 sm:right-4 sm:block lg:right-0">
              <DashboardGlance />
            </div>
            <div className="relative z-10 -translate-x-2 rotate-[-2deg] sm:-translate-x-6">
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
    </section>
  );
}
