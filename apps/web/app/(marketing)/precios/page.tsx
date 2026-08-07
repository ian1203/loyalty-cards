import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { ComparisonMatrix } from "../components/ComparisonMatrix";
import { LeadForm } from "../components/LeadForm";
import { PricingPlans } from "../components/PricingPlans";
import { ACTIVATION_INCLUDES, IVA_LABEL } from "../../../lib/marketing/content";

export const metadata: Metadata = {
  title: "Precios",
  description: "Planes y precios de Pragmia: Básico, Negocio e Intelligence. Activación aparte, oferta fundadora disponible.",
};

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Planes y precios</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Precios en pesos mexicanos ({IVA_LABEL}). La activación se cobra siempre por separado.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <PricingPlans />
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
