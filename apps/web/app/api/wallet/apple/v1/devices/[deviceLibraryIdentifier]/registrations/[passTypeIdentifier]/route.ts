import { listUpdatedSerialsForDevice } from "../../../../../logic";

// Ver el comentario en app/api/health/route.ts: toda ruta de esta app
// corre en Node explícito, nunca Edge (Edge no soporta `pg`).
export const runtime = "nodejs";

type Params = { deviceLibraryIdentifier: string; passTypeIdentifier: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { deviceLibraryIdentifier, passTypeIdentifier } = await params;
  const passesUpdatedSince = new URL(request.url).searchParams.get("passesUpdatedSince") ?? undefined;

  const result = await listUpdatedSerialsForDevice({
    deviceLibraryIdentifier,
    passTypeIdentifier,
    passesUpdatedSince,
  });

  return new Response(result.body ? JSON.stringify(result.body) : null, {
    status: result.status,
    headers: result.headers,
  });
}
