import { logDeviceErrors } from "../../logic";

// Ver el comentario en app/api/health/route.ts: toda ruta de esta app
// corre en Node explícito, nunca Edge (Edge no soporta `pg`).
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await logDeviceErrors(body);
  return new Response(null, { status: result.status, headers: result.headers });
}
