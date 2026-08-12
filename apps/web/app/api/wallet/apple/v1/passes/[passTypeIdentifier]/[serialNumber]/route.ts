import { resolveClientIp } from "../../../../../../../../lib/clientIp";
import { getLatestPass } from "../../../../logic";

// Ver el comentario en app/api/health/route.ts: toda ruta de esta app
// corre en Node explícito, nunca Edge (Edge no soporta `pg`).
export const runtime = "nodejs";

type Params = { passTypeIdentifier: string; serialNumber: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { passTypeIdentifier, serialNumber } = await params;

  const result = await getLatestPass({
    passTypeIdentifier,
    serialNumber,
    authorizationHeader: request.headers.get("authorization"),
    clientIp: resolveClientIp(request.headers),
  });

  return new Response(result.body ? (result.body as BodyInit) : null, {
    status: result.status,
    headers: result.headers,
  });
}
