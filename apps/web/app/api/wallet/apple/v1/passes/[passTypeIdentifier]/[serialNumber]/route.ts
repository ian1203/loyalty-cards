import { getLatestPass } from "../../../../logic";

type Params = { passTypeIdentifier: string; serialNumber: string };

export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { passTypeIdentifier, serialNumber } = await params;

  const result = await getLatestPass({
    passTypeIdentifier,
    serialNumber,
    authorizationHeader: request.headers.get("authorization"),
  });

  return new Response(result.body ? (result.body as BodyInit) : null, {
    status: result.status,
    headers: result.headers,
  });
}
