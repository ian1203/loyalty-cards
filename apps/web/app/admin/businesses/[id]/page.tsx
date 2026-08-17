import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "../../../../components/ui/badge";
import { getVerifiedSession } from "../../../../lib/supabase/session";
import { getBusinessDetail } from "../../businesses";
import { BrandingPanel } from "./BrandingPanel";
import { ImpersonateButton } from "./ImpersonateButton";
import { LocationsPanel } from "./LocationsPanel";
import { StatusControls } from "./StatusControls";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  unpaid: "Pago pendiente",
};

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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground underline">
          ← Negocios
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{business.name}</h1>
          <Badge variant={business.status === "active" ? "secondary" : "destructive"}>
            {STATUS_LABEL[business.status] ?? business.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{business.slug}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Acceso</h2>
        <ImpersonateButton businessId={business.id} ownPlatformRole={session.platformRole} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Estado</h2>
        {session.platformRole === "owner" ? (
          <StatusControls businessId={business.id} status={business.status} />
        ) : (
          <ReadOnlyNote />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Sucursales</h2>
        {session.platformRole === "owner" ? (
          <LocationsPanel businessId={business.id} locations={locations} />
        ) : (
          <LocationsReadOnlyList locations={locations} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Branding</h2>
        {session.platformRole === "owner" ? (
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
          <ReadOnlyNote />
        )}
      </section>
    </main>
  );
}

// Viewer: solo lectura estructural (ver requireOwner() en businesses.ts) —
// esta nota es la contraparte de UI, para no mostrar un formulario que el
// servidor va a rechazar de todas formas.
function ReadOnlyNote() {
  return <p className="text-sm text-muted-foreground">Tu cuenta es de solo lectura.</p>;
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
