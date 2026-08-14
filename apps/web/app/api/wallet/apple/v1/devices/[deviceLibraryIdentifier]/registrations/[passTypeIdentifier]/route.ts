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

  // Instrumentación de diagnóstico: confirmar si el dispositivo llega a
  // preguntar "¿qué cambió?" tras recibir un push — sin esto no había
  // ningún rastro en logs de que Apple/el dispositivo haya llamado acá.
  console.info(
    `[wallet:apple:registrations] GET deviceLibraryIdentifier=${deviceLibraryIdentifier}, passTypeIdentifier=${passTypeIdentifier}, passesUpdatedSince=${passesUpdatedSince ?? "(ninguno)"} → status=${result.status}, body=${JSON.stringify(result.body)}`,
  );

  return new Response(result.body ? JSON.stringify(result.body) : null, {
    status: result.status,
    headers: result.headers,
  });
}
