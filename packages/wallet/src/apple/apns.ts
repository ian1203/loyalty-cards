import http2 from "node:http2";
import { importPKCS8, SignJWT } from "jose";

// Envía el push VACÍO que le dice al iPhone "tu pase cambió, pídelo de
// nuevo" (ver skill wallet-integration — Apple no manda datos por push).
// Nunca lanza para "el push falló silenciosamente para el caller": el
// caller (notifyWalletOfTransaction) decide qué hacer con el error —
// best-effort vive AFUERA de este tipo, acá solo se intenta enviar.
export type ApnsSender = (input: {
  pushToken: string;
  passTypeIdentifier: string;
}) => Promise<void>;

export type ApnsCredentials = {
  teamId: string;
  apnsKeyId: string;
  apnsPrivateKeyPem: string;
};

// Auth moderna de APNs: JWT ES256 firmado con la llave .p8, no certificado
// legado. Exportada por separado — es la mitad "construcción del JWT" que
// el paso (f) pide poder testear sin red.
export async function buildApnsAuthToken(credentials: ApnsCredentials): Promise<string> {
  const key = await importPKCS8(credentials.apnsPrivateKeyPem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: credentials.apnsKeyId })
    .setIssuer(credentials.teamId)
    .setIssuedAt()
    .sign(key);
}

// El punto de inyección para tests: "el envío de red queda tras la
// interfaz y se mockea en tests" (paso f). La impl real usa node:http2
// (APNs exige HTTP/2, no hay forma de hablarle con fetch/HTTP1.1).
export type ApnsHttp2Post = (input: {
  pushToken: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; body: string }>;

async function defaultHttp2Post({
  pushToken,
  headers,
  body,
}: {
  pushToken: string;
  headers: Record<string, string>;
  body: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect("https://api.push.apple.com");
    client.on("error", reject);

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      ...headers,
    });
    req.setEncoding("utf8");

    let status = 0;
    let responseBody = "";
    req.on("response", (resHeaders) => {
      status = Number(resHeaders[":status"] ?? 0);
    });
    req.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ status, body: responseBody });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });
    req.end(body);
  });
}

export function createRealApnsSender(
  credentials: ApnsCredentials,
  post: ApnsHttp2Post = defaultHttp2Post,
): ApnsSender {
  return async ({ pushToken, passTypeIdentifier }) => {
    const jwt = await buildApnsAuthToken(credentials);
    const { status, body } = await post({
      pushToken,
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": passTypeIdentifier,
        "apns-push-type": "background",
        "content-type": "application/json",
      },
      // Payload vacío: es literalmente lo que le dice al dispositivo "pedí
      // el pase de nuevo", sin datos adentro (ver skill).
      body: "{}",
    });
    if (status < 200 || status >= 300) {
      throw new Error(`APNs respondió ${status}: ${body}`);
    }
  };
}

export type RecordedApnsPush = { pushToken: string; passTypeIdentifier: string };

// Fake: nunca golpea la red, solo registra qué hubiera mandado — para que
// los tests de notifyWalletOfTransaction (paso g/j) verifiquen "se encoló
// exactamente un push a cada dispositivo correcto" sin infraestructura.
//
// Cota dura (mismo hallazgo que google/signer.ts, misma revisión): esta es
// la impl que corre por defecto sin credenciales de Apple, incluido un
// despliegue real que aún no las configuró — sin límite, acumula para
// siempre el pushToken de cada dispositivo de cada negocio en un array de
// proceso.
const MAX_RECORDED_PUSHES = 200;

export function createFakeApnsSender(sentPushes: RecordedApnsPush[] = []): ApnsSender {
  return async (input) => {
    sentPushes.push(input);
    if (sentPushes.length > MAX_RECORDED_PUSHES) {
      sentPushes.shift();
    }
  };
}
