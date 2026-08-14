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

// Sin timeout explícito, un socket http2 colgado (conexión que nunca
// establece, o respuesta que nunca llega) deja la promesa sin resolver
// NI rechazar para siempre — el caller (notifyAppleDevices) nunca ve un
// error, nunca reintenta, y en un runtime serverless la función solo
// muere por el límite de duración de la PLATAFORMA, sin que nuestro
// propio catch/log llegue a correr (fallo real encontrado: sellos reales
// sin push visible, sin ningún error nuestro logueado). Estos dos
// timeouts convierten ese colgado en un Error explícito y logueado, sin
// importar la causa de fondo (fricción de red serverless→Apple, DNS,
// etc.) — el caller (notify.ts) ya tiene su propio withRetries encima,
// así que un timeout acá simplemente se vuelve un intento fallido más,
// no un caso especial.
const APNS_CONNECT_TIMEOUT_MS = 5000;
const APNS_REQUEST_TIMEOUT_MS = 5000;

// Últimos 6 caracteres nada más — suficiente para correlacionar con
// device_registrations.push_token en un log sin exponer el token
// completo (identificador de push por dispositivo, no una contraseña,
// pero tampoco hace falta imprimirlo entero).
function redactPushToken(pushToken: string): string {
  return `…${pushToken.slice(-6)}`;
}

export function buildApnsTimeoutMessage(
  phase: "connect" | "request",
  elapsedMs: number,
  pushToken: string,
  detail: string,
): string {
  return `APNs timeout en fase "${phase}" tras ${elapsedMs}ms (pushToken=${redactPushToken(pushToken)}) — ${detail}`;
}

// Host real de APNs — logueado tal cual antes de conectar (instrumentación
// de diagnóstico: confirmar en logs, no de memoria, que nunca se está
// hablando por accidente con el sandbox de Apple).
const APNS_HOST = "https://api.push.apple.com";

async function defaultHttp2Post({
  pushToken,
  headers,
  body,
}: {
  pushToken: string;
  headers: Record<string, string>;
  body: string;
}): Promise<{ status: number; body: string }> {
  const startedAt = Date.now();
  console.info(
    `[wallet:apns] conectando a ${APNS_HOST} — apns-topic=${headers["apns-topic"]}, pushToken=${redactPushToken(pushToken)}`,
  );
  return new Promise((resolve, reject) => {
    let settled = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;

    const client = http2.connect(APNS_HOST);

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(requestTimer);
      client.close();
      reject(error);
    };

    connectTimer = setTimeout(() => {
      fail(
        new Error(
          buildApnsTimeoutMessage(
            "connect",
            Date.now() - startedAt,
            pushToken,
            "la sesión http2 nunca terminó de conectar a api.push.apple.com",
          ),
        ),
      );
    }, APNS_CONNECT_TIMEOUT_MS);

    client.on("error", fail);

    client.once("connect", () => {
      clearTimeout(connectTimer);

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        ...headers,
      });
      req.setEncoding("utf8");

      requestTimer = setTimeout(() => {
        fail(
          new Error(
            buildApnsTimeoutMessage(
              "request",
              Date.now() - startedAt,
              pushToken,
              "la sesión conectó pero la respuesta nunca llegó",
            ),
          ),
        );
      }, APNS_REQUEST_TIMEOUT_MS);

      let status = 0;
      let responseBody = "";
      req.on("response", (resHeaders) => {
        status = Number(resHeaders[":status"] ?? 0);
      });
      req.on("data", (chunk: string) => {
        responseBody += chunk;
      });
      req.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(requestTimer);
        client.close();
        resolve({ status, body: responseBody });
      });
      req.on("error", fail);
      req.end(body);
    });
  });
}

// Decodifica el JWT ya firmado SOLO para logging de diagnóstico (kid/iss/
// iat/exp) — nunca el token completo ni la private key. jose no expone un
// "decode sin verificar" en este paquete tal como lo usamos acá, así que
// se decodifica a mano (header y payload son JSON base64url, sin verificar
// firma — no hace falta, ya lo firmamos nosotros mismos arriba).
function decodeJwtPartsForLogging(jwt: string): {
  kid: unknown;
  iss: unknown;
  iat: unknown;
  hasExp: boolean;
} {
  const [headerB64, payloadB64] = jwt.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as Record<string, unknown>;
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
  return { kid: header.kid, iss: payload.iss, iat: payload.iat, hasExp: "exp" in payload };
}

export function createRealApnsSender(
  credentials: ApnsCredentials,
  post: ApnsHttp2Post = defaultHttp2Post,
): ApnsSender {
  return async ({ pushToken, passTypeIdentifier }) => {
    // Log de entrada a la función misma — evidencia de que el código SÍ
    // llegó hasta acá, independiente de lo que pase después (instrumentación
    // pedida explícitamente: descartar "nunca se intentó" de "se intentó y
    // falló en algún punto").
    console.info(
      `[wallet:apns] createRealApnsSender invocado — pushToken=${redactPushToken(pushToken)}, passTypeIdentifier=${passTypeIdentifier}`,
    );

    const jwt = await buildApnsAuthToken(credentials);
    const { kid, iss, iat, hasExp } = decodeJwtPartsForLogging(jwt);
    console.info(
      `[wallet:apns] JWT de auth construido — kid=${kid}, iss=${iss}, iat=${iat} (${iat ? new Date(Number(iat) * 1000).toISOString() : "sin iat"}), exp presente=${hasExp}`,
    );

    let response: { status: number; body: string };
    try {
      response = await post({
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
    } catch (error) {
      // La llamada SÍ se intentó pero la promesa de post() rechazó (timeout
      // de apns.ts, error de conexión, etc.) — sin este catch, este caso es
      // indistinguible en los logs de "nunca se intentó".
      console.error(
        `[wallet:apns] excepción durante la llamada HTTP a APNs (pushToken=${redactPushToken(pushToken)}):`,
        error,
      );
      throw error;
    }

    const { status, body } = response;
    // Log SIEMPRE, no solo en error — status 200 de éxito antes solo se
    // inferia por ausencia de excepción, nunca se veía en los logs.
    console.info(
      `[wallet:apns] APNs respondió status=${status}${status >= 200 && status < 300 ? " (éxito)" : ` — body: ${body}`}`,
    );

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
