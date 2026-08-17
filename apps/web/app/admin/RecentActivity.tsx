import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { ActivityIcon } from "lucide-react";
import type { PlatformActivityRow } from "./activity";

const ACTION_LABELS: Record<string, string> = {
  "impersonation.started": "Entró como dueño de",
  "impersonation.ended": "Salió de",
  "business.created": "Creó el negocio",
  "business.status_changed": "Cambió el estado de",
  "business.branding_updated": "Editó el branding de",
  "business.deleted": "Eliminó el negocio",
  "location.created": "Creó una sucursal en",
  "location.updated": "Editó una sucursal en",
  "platform_admin.invited": "Invitó una cuenta de plataforma",
  "platform_admin.activated": "Reactivó una cuenta de plataforma",
  "platform_admin.deactivated": "Desactivó una cuenta de plataforma",
  "platform_admin.role_changed": "Cambió el rol de una cuenta de plataforma",
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "justo ahora";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} d`;
}

// Antes de esto, cada acción sensible de plataforma (impersonar, cambiar
// estado de un negocio, gestionar cuentas) quedaba en audit_logs pero
// NINGUNA vista la mostraba — auditoría write-only, indistinguible de no
// tener ninguna (hallazgo real de una revisión ofensiva). Esta es la
// primera lectura real — no es una alerta en tiempo real, pero convierte
// "nadie se entera nunca" en "cualquier owner puede revisarlo en /admin".
export function RecentActivity({ activity }: { activity: PlatformActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon className="size-4.5 text-muted-foreground" />
          Actividad reciente de plataforma
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {activity.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Sin actividad todavía.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {activity.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                <span>
                  <span className="font-medium">{row.actorEmail}</span>{" "}
                  {ACTION_LABELS[row.action] ?? row.action}
                  {row.businessName ? <> <span className="font-medium">{row.businessName}</span></> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(row.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
