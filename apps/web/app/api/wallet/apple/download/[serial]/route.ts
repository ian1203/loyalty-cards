import { downloadEnrollmentApplePass } from "../../../../../../lib/wallet/publicEnrollWallet";

// Ver el comentario en app/api/health/route.ts: toda ruta de esta app
// corre en Node explícito, nunca Edge (Edge no soporta `pg`).
export const runtime = "nodejs";

type Params = { serial: string };

// GET /api/wallet/apple/download/{serial}?t={authenticationToken} — el
// link real que reemplaza el data: URI roto de EnrollForm.tsx. A
// diferencia de app/api/wallet/apple/v1/passes/... (protocolo fijo de
// Apple, con Authorization: ApplePass header) esta ruta es nuestra, no de
// Apple: mismo mecanismo de auth (verifyBusinessIdForPassToken), pero el
// token viaja en el query string porque el caller es un <a href> tocado
// por un humano en Safari, no un cliente PassKit. 404 genérico (no 401)
// para token inválido/inexistente/de otro pase — mismo criterio
// anti-oráculo que el resto del wallet service.
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { serial } = await params;
  const token = new URL(request.url).searchParams.get("t");
  const noStore = { "cache-control": "no-store" };

  if (!token) {
    return new Response(null, { status: 404, headers: noStore });
  }

  const result = await downloadEnrollmentApplePass(serial, token);
  if (!result.ok) {
    return new Response(null, { status: 404, headers: noStore });
  }

  return new Response(result.pkpass as BodyInit, {
    status: 200,
    headers: {
      ...noStore,
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": "attachment; filename=tarjeta.pkpass",
    },
  });
}
