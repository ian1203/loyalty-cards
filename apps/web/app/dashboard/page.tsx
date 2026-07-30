import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { businesses, withTenantContext } from "@loyalty/db";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { getVerifiedSession } from "../../lib/supabase/session";

// Shell del dashboard: autenticado, tenant-scoped (business_id de la sesión
// verificada, nunca de input de cliente). Sin métricas todavía — de aquí se
// navega a las features de Fase 2 (/rewards, /customers) y Fase 3
// (/scanner).
export default async function DashboardPage() {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }

  if (session.kind !== "tenant_user") {
    // Un admin de plataforma no tiene "su negocio" que mostrar aquí.
    redirect("/admin");
  }

  const rows = await withTenantContext(session.businessId, (tx) =>
    tx.select().from(businesses).where(eq(businesses.id, session.businessId)),
  );
  const businessName = rows[0]?.name ?? "tu negocio";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{businessName}</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/rewards">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle>Programa de lealtad</CardTitle>
              <CardDescription>
                Configura la tarjeta de sellos y sus recompensas.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/customers">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>
                Da de alta clientes y consulta su tarjeta de sellos.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/scanner">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle>Scanner</CardTitle>
              <CardDescription>
                Escanea el QR del cliente para sellar o canjear.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </main>
  );
}
