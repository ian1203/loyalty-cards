import { withTenantContext } from "@loyalty/db";
import { Button } from "../../../../../components/ui/button";
import { requireTenantSession } from "../../../../../lib/supabase/session";
import { buildGoogleSaveLinkForCustomer } from "../../../../../lib/wallet/googleSaveLink";

// Server Component — mismo patrón que CustomerDetailPage (sesión resuelta
// directo, sin actions.ts: no es una Server Action invocable desde un
// cliente, es un componente que renderiza server-side). Se resuelve la
// sesión y se revalida el tenant acá adentro, aunque el caller
// (CustomerDetailPage) ya haya validado el mismo customerId — defensa en
// profundidad, no confiar en el estado de un componente padre para una
// operación que toca datos de negocio.
export async function GoogleWalletButton({ customerId }: { customerId: string }) {
  const session = await requireTenantSession();
  if (!session) {
    return null;
  }

  // staff = solo /scanner — mismo gate que customers/[id]/page.tsx,
  // repetido acá por el mismo criterio de defensa en profundidad del
  // comentario de arriba (no confiar en que el padre ya filtró).
  if (session.role === "staff") {
    return null;
  }

  const saveLink = await withTenantContext(session.businessId, (tx) =>
    buildGoogleSaveLinkForCustomer(tx, session.businessId, customerId),
  );
  if (!saveLink) {
    return null;
  }

  return (
    <Button asChild variant="outline">
      <a href={saveLink}>Agregar a Google Wallet (prueba)</a>
    </Button>
  );
}
