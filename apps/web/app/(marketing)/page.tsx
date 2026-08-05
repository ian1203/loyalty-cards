import Link from "next/link";
import { AppleIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { ComingSoonBadge } from "./components/ComingSoonBadge";
import { LeadForm } from "./components/LeadForm";
import { WalletCardMockup } from "./components/WalletCardMockup";
import {
  BENEFITS,
  BRAND,
  HERO,
  HOW_IT_WORKS,
  IDEAL_FOR,
  PROBLEM_POINTS,
  buildWhatsappLink,
} from "../../lib/marketing/content";

export default function MarketingHomePage() {
  const demoLink = buildWhatsappLink();

  return (
    <>
      <section className="border-b bg-gradient-to-b from-muted/40 to-background">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {BRAND.category}
            </p>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              {HERO.headline}
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">{HERO.subhead}</p>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <a href={demoLink} target="_blank" rel="noopener noreferrer">
                  {HERO.ctaDemoLabel}
                </a>
              </Button>
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                {HERO.ctaLoginLabel}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <AppleIcon className="size-4" /> Apple Wallet
              </span>
              <span className="flex items-center gap-1.5">
                <SmartphoneIcon className="size-4" /> Google Wallet
              </span>
              <span>Hecho en {BRAND.location}</span>
            </div>
          </div>
          <WalletCardMockup />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">El problema que resolvemos</h2>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PROBLEM_POINTS.map((point) => (
            <li key={point} className="flex gap-3 text-muted-foreground">
              <span aria-hidden="true" className="text-foreground">
                —
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Cómo funciona</h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.step} className="flex flex-col gap-2 rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {item.step}
                  </span>
                  <span className="font-medium">{item.title}</span>
                  {item.comingSoon ? <ComingSoonBadge /> : null}
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Componentes</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <Card key={benefit.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {benefit.title}
                  {benefit.comingSoon ? <ComingSoonBadge /> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{benefit.description}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Para quién es</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {IDEAL_FOR.map((item) => (
              <span key={item} className="rounded-full border bg-card px-4 py-1.5 text-sm">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">¿Listo para que tus clientes regresen?</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{HERO.subhead}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <a href={demoLink} target="_blank" rel="noopener noreferrer">
                Escríbenos por WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/precios">Ver precios</Link>
            </Button>
          </div>
          <div className="mt-10 text-left">
            <p className="mb-4 text-center text-sm text-muted-foreground">
              O déjanos tus datos y te contactamos nosotros:
            </p>
            <LeadForm />
          </div>
        </div>
      </section>
    </>
  );
}
