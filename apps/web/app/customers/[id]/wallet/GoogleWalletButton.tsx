import { withTenantContext } from "@loyalty/db";
import { requireTenantSession } from "../../../../lib/supabase/session";
import { buildGoogleSaveLinkForCustomer } from "../../../../lib/wallet/googleSaveLink";

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

  const saveLink = await withTenantContext(session.businessId, (tx) =>
    buildGoogleSaveLinkForCustomer(tx, session.businessId, customerId),
  );
  if (!saveLink) {
    return null;
  }

  return (
    <a
      href={saveLink}
      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
    >
      Agregar a Google Wallet (prueba)
    </a>
  );
}
