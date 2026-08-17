import { ShieldAlertIcon } from "lucide-react";
import { endImpersonationAction } from "../app/admin/impersonation-actions";
import type { PlatformRole } from "../lib/supabase/session";
import { Button } from "./ui/button";

// Visible EXCLUSIVAMENTE en una sesión tenant_user con session.impersonation
// no-null (ver getVerifiedSession) — un dueño/staff real de este negocio
// nunca tiene ese campo en su sesión, así que este componente
// estructuralmente nunca se renderiza para ellos. No depende de ninguna
// cookie ni estado aparte: la fuente es el JWT ya verificado.
//
// Bug real corregido acá: el botón "Salir" no traía su propio color de
// texto (variant="outline" de Button no lo fija) y heredaba
// text-warning-foreground del contenedor — blanco sobre blanco en modo
// claro, solo legible al pasar el mouse (hover cambiaba el fondo). Fix:
// el botón fija su propio color/borde en vez de heredar del banner.
export function ImpersonationBanner({
  businessName,
  platformRole,
}: {
  businessName: string;
  platformRole: PlatformRole;
}) {
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-warning px-4 py-2.5 text-sm font-medium text-warning-foreground shadow-token-sm">
      <span className="flex items-center gap-2">
        <ShieldAlertIcon className="size-4 shrink-0" />
        Estás {platformRole === "owner" ? "operando" : "viendo"} <strong>{businessName}</strong>{" "}
        como admin de plataforma
        {platformRole === "viewer" ? " — solo lectura, sin permiso de escritura" : ""}.
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
