import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { businesses, withTenantContext } from "@loyalty/db";
import { AppShell } from "../../components/AppShell";
import { BusinessSuspendedScreen } from "../../components/BusinessSuspendedScreen";
import { ImpersonationBanner } from "../../components/ImpersonationBanner";
import { createClient } from "../../lib/supabase/server";
import { getVerifiedSession } from "../../lib/supabase/session";

// Shell de TODO /dashboard, /rewards, /customers, /scanner. Cada page.tsx
// sigue llamando getVerifiedSession()/requireTenantSession() exactamente
// igual que antes para SU propio fetch — este layout NO reemplaza ese
// chequeo, solo agrega el mismo chequeo una vez más (mismo primitivo
// sancionado, cero lógica nueva) para poder renderizar el nombre del
// negocio y el email en la navegación. Defensa en profundidad a
// propósito, no una optimización para evitar la llamada duplicada.
//
// Misma rama de 3 vías que ya tenía dashboard/page.tsx (no autenticado →
// /login; platform admin → /admin, no tiene "su negocio" que mostrar
// acá; tenant_user → sigue) — replicada tal cual, no simplificada a
// requireTenantSession(), para no cambiar a dónde va un platform admin
// que visita estas rutas.
export default async function ProductLayout({ children }: { children: ReactNode }) {
  const verified = await getVerifiedSession();
  if (!verified.authenticated) {
    redirect("/login");
  }
  if (verified.kind !== "tenant_user") {
    redirect("/admin");
  }
  const session = verified;

  const [business] = await withTenantContext(session.businessId, (tx) =>
    tx
      .select({ name: businesses.name, status: businesses.status })
      .from(businesses)
      .where(eq(businesses.id, session.businessId)),
  );

  // Bloqueo de TODO el dashboard por pago pendiente — más amplio que
  // 'suspended' a propósito (ver CLAUDE.md, sección "Suspensión por falta
  // de pago"). Se salta si hay impersonación activa: el propósito del
  // panel de admin incluye poder entrar a revisar/arreglar un negocio con
  // pago pendiente — el dueño real, en cambio, sí queda bloqueado.
  if (business?.status === "unpaid" && !session.impersonation) {
    return <BusinessSuspendedScreen />;
  }

  // Email no es parte de VerifiedSession (solo trae lo que se usa para
  // autorizar: business_id/tenant_role/location_id) — se lee acá aparte,
  // con el mismo cliente/método de verificación (getClaims(), nunca
  // getSession()) puramente para mostrarlo en el menú de usuario. Cero
  // cambio a lib/supabase/session.ts.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const email =
    typeof claimsData?.claims.email === "string" ? claimsData.claims.email : "Sesión activa";

  return (
    <>
      {session.impersonation ? (
        <ImpersonationBanner businessName={business?.name ?? "este negocio"} />
      ) : null}
      <AppShell businessName={business?.name ?? "Tu negocio"} email={email} role={session.role}>
        {children}
      </AppShell>
    </>
  );
}
