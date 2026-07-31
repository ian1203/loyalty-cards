import { logDeviceErrors } from "../../logic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await logDeviceErrors(body);
  return new Response(null, { status: result.status, headers: result.headers });
}
