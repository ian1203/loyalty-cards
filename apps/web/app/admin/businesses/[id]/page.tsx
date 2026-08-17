import { notFound, redirect } from "next/navigation";
import { KeyRoundIcon, MapPinIcon, PaletteIcon, ToggleLeftIcon } from "lucide-react";
import { Badge } from "../../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { PageHeader } from "../../../../components/PageHeader";
import { getVerifiedSession } from "../../../../lib/supabase/session";
import { getBusinessDetail } from "../../businesses";
import { BrandingPanel } from "./BrandingPanel";
import { BrandingReadOnly } from "./BrandingReadOnly";
import { ImpersonateButton } from "./ImpersonateButton";
import { LocationsPanel } from "./LocationsPanel";
import { StatusControls } from "./StatusControls";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  unpaid: "Pago pendiente",
};

// Cada bloque del detalle vive en su propia Card con un título con ícono —
// mismo patrón visual en las cuatro secciones (Acceso/Estado/Sucursales/
// Branding) para que una sección nueva en el futuro (p.ej. "Facturación")
// solo agregue una Card más siguiendo el mismo molde, sin reordenar nada.
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4.5 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function LocationsReadOnlyList({
  locations,
}: {
  locations: { id: string; name: string; address: string | null; isActive: boolean }[];
}) {
  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {locations.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">Sin sucursales.</p>
      ) : (
        locations.map((location) => (
          <div key={location.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex flex-col">
              <span className="font-medium">{location.name}</span>
              {location.address ? (
                <span className="text-sm text-muted-foreground">{location.address}</span>
              ) : null}
            </div>
            <Badge variant={location.isActive ? "secondary" : "destructive"}>
              {location.isActive ? "Activa" : "Inactiva"}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}

export default async function AdminBusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.kind !== "platform_admin") {
    redirect("/dashboard");
  }

  const detail = await getBusinessDetail(id);
  if (!detail) {
    notFound();
  }
  const { business, locations } = detail;
  const isOwner = session.platformRole === "owner";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={business.name}
        description={business.slug}
        back={{ href: "/admin", label: "Negocios" }}
        actions={
          <Badge
            variant={business.status === "active" ? "secondary" : "destructive"}
            className="text-sm"
          >
            {STATUS_LABEL[business.status] ?? business.status}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Acceso" icon={KeyRoundIcon}>
          <ImpersonateButton businessId={business.id} />
        </Section>

        <Section title="Estado" icon={ToggleLeftIcon}>
          <StatusControls businessId={business.id} status={business.status} canDelete={isOwner} />
        </Section>
      </div>

      <Section title="Sucursales" icon={MapPinIcon}>
        {isOwner ? (
          <LocationsPanel businessId={business.id} locations={locations} />
        ) : (
          <LocationsReadOnlyList locations={locations} />
        )}
      </Section>

      <Section title="Branding" icon={PaletteIcon}>
        {isOwner ? (
          <BrandingPanel
            businessId={business.id}
            branding={{
              brandColorHex: business.brandColorHex,
              logoUrl: business.logoUrl,
              walletLogoUrl: business.walletLogoUrl,
              walletHeroUrl: business.walletHeroUrl,
              googleLogoUri: business.googleLogoUri,
              googleHeroUri: business.googleHeroUri,
              googleWideLogoUri: business.googleWideLogoUri,
            }}
          />
        ) : (
          <BrandingReadOnly
            branding={{
              brandColorHex: business.brandColorHex,
              logoUrl: business.logoUrl,
              walletLogoUrl: business.walletLogoUrl,
              walletHeroUrl: business.walletHeroUrl,
              googleLogoUri: business.googleLogoUri,
              googleHeroUri: business.googleHeroUri,
              googleWideLogoUri: business.googleWideLogoUri,
            }}
          />
        )}
      </Section>
    </div>
  );
}
