import Link from "next/link";
import { Button } from "../../components/ui/button";
import { CardPreviewer } from "./components/CardPreviewer";
import { ComponentsBento } from "./components/ComponentsBento";
import { HowItWorksStamps } from "./components/HowItWorksStamps";
import { LeadForm } from "./components/LeadForm";
import { ProblemSection } from "./components/ProblemSection";
import { ProductShowcase } from "./components/ProductShowcase";
import { RevealOnScroll } from "./components/RevealOnScroll";
import { TrustBar } from "./components/TrustBar";
import { WalletCardMockup } from "./components/WalletCardMockup";
import { BRAND, HERO, IDEAL_FOR, buildWhatsappLink } from "../../lib/marketing/content";

export default function MarketingHomePage() {
  const demoLink = buildWhatsappLink();

  return (
    <>
      <section className="border-b bg-gradient-to-b from-muted/40 to-background">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 px-6 pb-20 pt-16 sm:pb-28 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{BRAND.category}</p>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl">
              Crea tu programa. Registra cada visita. Haz que tus clientes{" "}
              <span className="text-stamp">regresen</span>.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">{HERO.subhead}</p>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="press">
                <a href={demoLink} target="_blank" rel="noopener noreferrer">
                  {HERO.ctaDemoLabel}
                </a>
              </Button>
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                {HERO.ctaLoginLabel}
              </Link>
            </div>
          </div>
          <WalletCardMockup />
        </div>
      </section>

      <TrustBar />
      <ProductShowcase />
      <ProblemSection />
      <HowItWorksStamps />
      <ComponentsBento />
      <CardPreviewer />

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <RevealOnScroll>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Para quién es</h2>
            <div className="mt-6 flex flex-wrap gap-3">
              {IDEAL_FOR.map((item) => (
                <span key={item} className="rounded-full border bg-card px-4 py-1.5 text-sm">
                  {item}
                </span>
              ))}
            </div>
          </RevealOnScroll>
        </div>
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          <RevealOnScroll>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              ¿Listo para que tus clientes regresen?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{HERO.subhead}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" className="press">
                <a href={demoLink} target="_blank" rel="noopener noreferrer">
                  {HERO.ctaDemoLabel}
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="press">
                <Link href="/precios">Ver precios</Link>
              </Button>
            </div>
            <div className="mt-10 text-left">
              <p className="mb-4 text-center text-sm text-muted-foreground">
                O déjanos tus datos y te contactamos nosotros:
              </p>
              <LeadForm />
            </div>
          </RevealOnScroll>
        </div>
      </section>
    </>
  );
}
