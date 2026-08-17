import { ShieldAlertIcon } from "lucide-react";
import { endImpersonationAction } from "../app/admin/impersonation-actions";
import type { PlatformRole } from "../lib/supabase/session";
import { Button } from "./ui/button";

// Visible EXCLUSIVAMENTE en una sesión tenant_user con session.impersonation
// no-null (ver getVerifiedSession) — un dueño/staff real de este negocio
// nunca tiene ese campo en su sesión, así que este componente
// estructuralmente nunca se renderiza para ellos. No depende de ninguna
// cookie ni estado aparte: la fuente es el JWT ya verificado.
export function ImpersonationBanner({
  businessName,
  platformRole,
}: {
  businessName: string;
  platformRole: PlatformRole;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground">
      <span className="flex items-center gap-2">
        <ShieldAlertIcon className="size-4 shrink-0" />
        Estás {platformRole === "owner" ? "operando" : "viendo"} <strong>{businessName}</strong>{" "}
        como admin de plataforma
        {platformRole === "viewer" ? " — solo lectura, sin permiso de escritura" : ""}.
      </span>
      <form action={endImpersonationAction}>
        <Button type="submit" size="sm" variant="outline">
          Salir
        </Button>
      </form>
    </div>
  );
}
