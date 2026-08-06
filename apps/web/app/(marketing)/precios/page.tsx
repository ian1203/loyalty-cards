import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { ComparisonMatrix } from "../components/ComparisonMatrix";
import { LeadForm } from "../components/LeadForm";
import {
  ACTIVATION_INCLUDES,
  ANNUAL_TERMS,
  FOUNDER_OFFER,
  IVA_LABEL,
  PLANS,
  buildWhatsappLink,
} from "../../../lib/marketing/content";

export const metadata: Metadata = {
  title: "Precios",
  description: "Planes y precios de Pragmia: Básico, Negocio e Intelligence. Activación aparte, oferta fundadora disponible.",
};

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Planes y precios</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Precios en pesos mexicanos ({IVA_LABEL}). La activación se cobra siempre por separado.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6">
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex flex-col items-start gap-1 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{FOUNDER_OFFER.headline}</p>
              <p className="text-sm text-muted-foreground">{FOUNDER_OFFER.description}</p>
            </div>
            <Badge variant="outline">Primeros {FOUNDER_OFFER.spotsAvailable} negocios</Badge>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const demoLink = buildWhatsappLink(
              `Hola, me interesa el plan ${plan.name} de Pragmia. ¿Podemos agendar una demo de 10 minutos?`,
            );
            return (
              <Card
                key={plan.id}
                className={plan.popular ? "border-primary shadow-md ring-1 ring-primary" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.popular ? <Badge>Más popular</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <p className="text-3xl font-bold">
                      {currency.format(plan.monthly)}
                      <span className="text-base font-normal text-muted-foreground"> /mes {IVA_LABEL}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      o {currency.format(plan.annual)} /año {IVA_LABEL} · ahorras {currency.format(plan.annualSavings)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Activación: {currency.format(plan.activation)} {IVA_LABEL} (por separado)
                  </p>
                  <p className="text-sm">{plan.idealFor}</p>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full" variant={plan.popular ? "default" : "outline"}>
                    <a href={demoLink} target="_blank" rel="noopener noreferrer">
                      Agenda una demo
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">{ANNUAL_TERMS}</p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-10">
        <h2 className="text-lg font-semibold">Qué incluye la activación</h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {ACTIVATION_INCLUDES.map((item) => (
            <li key={item} className="flex gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <ComparisonMatrix />
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">¿Dudas sobre qué plan te conviene?</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Cuéntanos de tu negocio y te ayudamos a elegir.
          </p>
          <div className="mt-8">
            <LeadForm />
          </div>
        </div>
      </section>
    </>
  );
}
