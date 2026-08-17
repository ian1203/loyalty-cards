import { CircleAlertIcon } from "lucide-react";
import { CONTACT } from "../lib/marketing/content";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

// Bloqueo de TODO el dashboard (no solo sellar/canjear, a diferencia de
// 'suspended' — ver CLAUDE.md) para una sesión tenant_user real (dueño o
// staff) cuando business.status === 'unpaid'. Se salta por completo para
// una sesión de impersonación (ver (product)/layout.tsx) — el propósito
// del panel de admin incluye poder entrar a revisar/arreglar un negocio
// con pago pendiente.
export function BusinessSuspendedScreen() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Alert variant="destructive">
          <CircleAlertIcon className="size-4" />
          <AlertTitle>Cuenta suspendida por pago pendiente</AlertTitle>
          <AlertDescription>
            El acceso a tu panel está pausado. Contáctanos para reactivarlo.
          </AlertDescription>
        </Alert>
        <p className="text-center text-sm text-muted-foreground">
          Escríbenos a{" "}
          <a href={`mailto:${CONTACT.email}`} className="underline">
            {CONTACT.email}
          </a>{" "}
          o por WhatsApp al {CONTACT.whatsappNumberDisplay}.
        </p>
      </div>
    </div>
  );
}
