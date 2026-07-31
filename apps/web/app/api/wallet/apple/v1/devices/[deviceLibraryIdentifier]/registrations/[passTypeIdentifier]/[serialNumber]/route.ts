import { registerDeviceForPass, unregisterDeviceForPass } from "../../../../../../logic";

type Params = {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
};

export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;
  const body = (await request.json().catch(() => ({}))) as { pushToken?: string };

  const result = await registerDeviceForPass({
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
    authorizationHeader: request.headers.get("authorization"),
    pushToken: String(body.pushToken ?? ""),
  });

  return new Response(result.body ? JSON.stringify(result.body) : null, {
    status: result.status,
    headers: result.headers,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<Params> }) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;

  const result = await unregisterDeviceForPass({
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
    authorizationHeader: request.headers.get("authorization"),
  });

  return new Response(null, { status: result.status, headers: result.headers });
}
