import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "./AdminShell";
import { createClient } from "../../lib/supabase/server";
import { getVerifiedSession } from "../../lib/supabase/session";

// Shell de TODO /admin — mismo criterio que (product)/layout.tsx: cada
// page.tsx sigue llamando getVerifiedSession() de forma independiente para
// SU propio fetch/gate (defensa en profundidad deliberada), este layout
// solo agrega el mismo chequeo una vez más para poder renderizar el shell
// (email, rol, nav). Una sesión tenant_user (dueño/staff real, o un admin
// impersonando) nunca llega acá — impersonar ya resuelve como tenant_user
// y vive bajo (product)/, con su propio layout/banner.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.kind !== "platform_admin") {
    redirect("/dashboard");
  }

  // Email no es parte de VerifiedSession — se lee aparte, mismo patrón que
  // (product)/layout.tsx (mismo cliente/método de verificación, getClaims(),
  // nunca getSession()).
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const email =
    typeof claimsData?.claims.email === "string" ? claimsData.claims.email : "Sesión activa";

  return (
    <AdminShell email={email} platformRole={session.platformRole}>
      {children}
    </AdminShell>
  );
}
