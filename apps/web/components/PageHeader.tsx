import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

// Reemplaza el patrón repetido "flex items-center justify-between" +
// el link suelto "← Dashboard" que vivía copy-pegado en cada página de
// producto — ahora la navegación real vive en <AppShell>, esto solo
// encabeza el contenido de la página. `back` es distinto de esa nav
// general: es un breadcrumb real (p.ej. detalle de cliente → volver al
// directorio), no un atajo al dashboard.
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {back ? (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
