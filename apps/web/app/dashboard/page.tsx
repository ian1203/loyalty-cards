import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { businesses, withTenantContext } from "@loyalty/db";
import { getVerifiedSession } from "../../lib/supabase/session";

// Shell vacío pero real: ruta autenticada, tenant-scoped de verdad (pasa
// por withTenantContext con el business_id de la sesión verificada — nunca
// de un input de cliente). Sin métricas ni datos reales todavía, eso es
// Fase 2.
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
    <main>
      <h1>{businessName}</h1>
      <p>Bienvenido a tu dashboard. Todavía no hay datos que mostrar.</p>
    </main>
  );
}
