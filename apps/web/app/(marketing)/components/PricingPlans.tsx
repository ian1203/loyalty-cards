import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { ANNUAL_TERMS, IVA_LABEL, PLANS, buildWhatsappLink } from "../../../lib/marketing/content";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

// Grid de planes — la ÚNICA fuente de este marcado, usada por la sección
// "Planes y precios" de la home (id="precios", la única superficie de
// precios que existe — ya no hay una ruta /precios separada).
export function PricingPlans() {
  return (
    <div className="flex flex-col gap-10">
      <div>
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
      </div>
    </div>
  );
}
