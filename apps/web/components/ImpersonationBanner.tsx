import { ShieldAlertIcon } from "lucide-react";
import { endImpersonationAction } from "../app/admin/impersonation-actions";
import { Button } from "./ui/button";

// Visible EXCLUSIVAMENTE en una sesión tenant_user con session.impersonation
// no-null (ver getVerifiedSession) — un dueño/staff real de este negocio
// nunca tiene ese campo en su sesión, así que este componente
// estructuralmente nunca se renderiza para ellos. No depende de ninguna
// cookie ni estado aparte: la fuente es el JWT ya verificado.
//
// Mensaje único para ambos roles de plataforma: owner y viewer impersonan
// con el mismo acceso completo (ver startImpersonation), así que no hay
// distinción "solo lectura" que mostrar acá.
export function ImpersonationBanner({ businessName }: { businessName: string }) {
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-warning px-4 py-2.5 text-sm font-medium text-warning-foreground shadow-token-sm">
      <span className="flex items-center gap-2">
        <ShieldAlertIcon className="size-4 shrink-0" />
        Estás operando <strong>{businessName}</strong> como admin de plataforma.
      </span>
      <form action={endImpersonationAction}>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="border-warning-foreground/40 bg-transparent text-warning-foreground hover:bg-warning-foreground/10 hover:text-warning-foreground"
        >
          Salir
        </Button>
      </form>
    </div>
  );
}
