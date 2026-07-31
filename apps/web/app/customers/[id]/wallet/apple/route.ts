import { requireTenantSession } from "../../../../../lib/supabase/session";
import { downloadApplePassForSession } from "./logic";

type Params = { id: string };

// GET /customers/{id}/wallet/apple — descarga autenticada (sesión de
// tenant normal), a diferencia de app/api/wallet/apple/v1/passes/... (el
// web service PÚBLICO de Apple, sin sesión). Cache-Control: no-store
// mismo criterio que el resto de Wallet — es un .pkpass firmado con datos
// de negocio/cliente, nunca se cachea.
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const session = await requireTenantSession();
  if (!session) {
    return new Response(null, { status: 302, headers: { location: "/login" } });
  }

  const { id } = await params;
  const result = await downloadApplePassForSession(session, id);
  if (!result.ok) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }

  return new Response(result.pkpass as BodyInit, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": "attachment; filename=tarjeta.pkpass",
    },
  });
}
