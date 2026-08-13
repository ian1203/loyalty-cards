import { generateKeyPairSync } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { GoogleCredentials } from "../config";

// Google no usa push (ver skill wallet-integration): el objeto se
// actualiza con un PATCH directo a la Wallet REST API, y el link "Add to
// Google Wallet" es un JWT firmado que referencia (o embebe, para
// creación) el Loyalty Object/Class. Los payloads de Class/Object en sí
// (los campos de negocio: nombre, colores, sellos) los arma
// google/loyaltyPayload.ts (paso i) — esto es solo el adaptador de
// firma+transporte, agnóstico de qué hay adentro del payload.
export type GoogleSaveLinkPayload = {
  loyaltyObjects?: Record<string, unknown>[];
  loyaltyClasses?: Record<string, unknown>[];
  origins?: string[];
};

// SCAFFOLDING (research + scaffolding de notificación por proximidad, ver
// skill wallet-integration) — sin caller real todavía en notify.ts.
// TEXT_AND_NOTIFY: agrega el mensaje al "back of pass" (panel de
// detalles) Y dispara un push real — a diferencia de merchantLocations
// (solo lat/long, texto fijo controlado por Google), este SÍ es
// personalizable de nuestro lado. Mismo límite combinado de 3
// notificaciones/24h por pase que notifyOnUpdate (ver la ronda que probó
// esto contra un objeto de prueba real).
// messageType acotado a "TEXT_AND_NOTIFY" a propósito — es el único valor
// que de verdad probamos contra la API real (200, notificación agregada);
// Google documenta otros (TEXT, EXPIRATION_NOTIFICATION) pero no los
// necesitamos hoy y no vale afirmar su forma exacta sin haberlos probado.
export type LoyaltyObjectMessage = {
  header: string;
  body: string;
  messageType: "TEXT_AND_NOTIFY";
};

export type GoogleWalletClient = {
  upsertLoyaltyClass(classId: string, payload: Record<string, unknown>): Promise<void>;
  upsertLoyaltyObject(objectId: string, payload: Record<string, unknown>): Promise<void>;
  addLoyaltyObjectMessage(objectId: string, message: LoyaltyObjectMessage): Promise<void>;
  // Mensaje a nivel CLASE (a diferencia de addLoyaltyObjectMessage, que es
  // por cliente) — un negocio tiene UNA clase (modelo "una clase por
  // negocio", ver skill wallet-integration), así que un solo llamado
  // aquí es lo que permite el broadcast de promociones a TODOS los
  // clientes de ese negocio de una vez (ver
  // apps/web/lib/wallet/promoNotify.ts). Semántica de fan-out real y si
  // comparte cuota con el límite de 3/24h por objeto: sin confirmar
  // contra la API real todavía (ver plan de la feature) — el método
  // existe y firma correcto, pero la garantía de entrega a TODOS los
  // objetos queda como verificación pendiente.
  addLoyaltyClassMessage(classId: string, message: LoyaltyObjectMessage): Promise<void>;
  buildSaveLink(payload: GoogleSaveLinkPayload): Promise<string>;
};

type FetchFn = typeof fetch;

const WALLET_OBJECTS_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function signServiceAccountAssertion(
  serviceAccount: GoogleCredentials["serviceAccount"],
): Promise<string> {
  const key = await importPKCS8(serviceAccount.private_key, "RS256");
  return new SignJWT({ scope: "https://www.googleapis.com/auth/wallet_object.issuer" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

async function fetchAccessToken(
  credentials: GoogleCredentials,
  fetchImpl: FetchFn,
): Promise<string> {
  const assertion = await signServiceAccountAssertion(credentials.serviceAccount);
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`No se pudo obtener el access token de Google: ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// Insert-o-patch: la Wallet API no tiene un verbo "upsert" nativo — se
// intenta crear y, si ya existe (409), se actualiza.
async function upsert(
  collectionUrl: string,
  resourceId: string,
  payload: Record<string, unknown>,
  accessToken: string,
  fetchImpl: FetchFn,
): Promise<void> {
  const insertRes = await fetchImpl(collectionUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (insertRes.ok) return;
  if (insertRes.status !== 409) {
    const body = await insertRes.text().catch(() => "");
    throw new Error(`Google Wallet API respondió ${insertRes.status} al crear ${resourceId}: ${body}`);
  }
  const patchRes = await fetchImpl(`${collectionUrl}/${resourceId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!patchRes.ok) {
    const body = await patchRes.text().catch(() => "");
    throw new Error(`Google Wallet API respondió ${patchRes.status} al actualizar ${resourceId}: ${body}`);
  }
}

export function createRealGoogleWalletClient(
  credentials: GoogleCredentials,
  fetchImpl: FetchFn = fetch,
): GoogleWalletClient {
  return {
    async upsertLoyaltyClass(classId, payload) {
      const accessToken = await fetchAccessToken(credentials, fetchImpl);
      await upsert(`${WALLET_OBJECTS_BASE}/loyaltyClass`, classId, payload, accessToken, fetchImpl);
    },
    async upsertLoyaltyObject(objectId, payload) {
      const accessToken = await fetchAccessToken(credentials, fetchImpl);
      await upsert(`${WALLET_OBJECTS_BASE}/loyaltyObject`, objectId, payload, accessToken, fetchImpl);
    },
    async addLoyaltyObjectMessage(objectId, message) {
      const accessToken = await fetchAccessToken(credentials, fetchImpl);
      const res = await fetchImpl(`${WALLET_OBJECTS_BASE}/loyaltyObject/${objectId}/addMessage`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Google Wallet API respondió ${res.status} en addMessage de ${objectId}: ${body}`);
      }
    },
    async addLoyaltyClassMessage(classId, message) {
      const accessToken = await fetchAccessToken(credentials, fetchImpl);
      const res = await fetchImpl(`${WALLET_OBJECTS_BASE}/loyaltyClass/${classId}/addMessage`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Google Wallet API respondió ${res.status} en addMessage de ${classId}: ${body}`);
      }
    },
    async buildSaveLink(payload) {
      const key = await importPKCS8(credentials.serviceAccount.private_key, "RS256");
      const jwt = await new SignJWT({
        iss: credentials.serviceAccount.client_email,
        aud: "google",
        typ: "savetowallet",
        payload: {
          loyaltyObjects: payload.loyaltyObjects ?? [],
          loyaltyClasses: payload.loyaltyClasses ?? [],
        },
        origins: payload.origins ?? [],
      })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuedAt()
        // El link embebe el loyaltyObject completo, incluido el barcode
        // (= wallet_token del cliente, en claro dentro del JWT firmado) —
        // es de un solo uso, para la instalación inicial. Sin exp, un
        // link viejo capturado (historial, reenvío) sigue siendo válido
        // para siempre (hallazgo de la segunda revisión de seguridad de
        // Fase 4). 15 min alcanza de sobra para que el usuario haga clic.
        .setExpirationTime("15m")
        .sign(key);
      return `https://pay.google.com/gp/v/save/${jwt}`;
    },
  };
}

export type FakeGoogleWalletClient = GoogleWalletClient & {
  insertCalls: Array<{ url: string; payload: Record<string, unknown> }>;
  patchCalls: Array<{ url: string; payload: Record<string, unknown> }>;
};

// Fake: reusa el código REAL de firma/REST (createRealGoogleWalletClient)
// contra una cuenta de servicio de prueba generada en memoria
// (node:crypto, sin openssl — un JWT RS256 solo necesita un par de claves,
// a diferencia del PKCS#7 de Apple que necesita un certificado X.509) y un
// `fetch` fake que nunca sale a la red. Corre el mismo código de firma que
// la impl real; solo el transporte está simulado.
export function createFakeGoogleWalletClient(): FakeGoogleWalletClient {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const fakeCredentials: GoogleCredentials = {
    issuerId: "fake-issuer-id",
    serviceAccount: {
      client_email: "fake@fake.iam.gserviceaccount.com",
      private_key: privateKey,
    },
  };

  const insertCalls: Array<{ url: string; payload: Record<string, unknown> }> = [];
  const patchCalls: Array<{ url: string; payload: Record<string, unknown> }> = [];

  // Cota dura (hallazgo de la segunda revisión de seguridad de Fase 4): la
  // impl fake es el FALLBACK por defecto sin credenciales de Google —
  // incluido un despliegue real que todavía no las tiene configuradas (ver
  // docs/WALLET-SETUP.md). Sin cota, cada upsert acumula para siempre el
  // payload completo (incluido el wallet_token del cliente, el barcode)
  // de TODOS los negocios en un array de proceso — una fuga de memoria de
  // datos sensibles en un proceso long-running, no solo un problema de
  // tamaño. Ring buffer: descarta lo más viejo, conserva la observabilidad
  // reciente que necesitan los tests.
  const MAX_RECORDED_CALLS = 200;
  function pushBounded(list: Array<{ url: string; payload: Record<string, unknown> }>, entry: { url: string; payload: Record<string, unknown> }): void {
    list.push(entry);
    if (list.length > MAX_RECORDED_CALLS) {
      list.shift();
    }
  }

  const fakeFetch: FetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      return new Response(JSON.stringify({ access_token: "fake-access-token" }), { status: 200 });
    }

    const method = init?.method ?? "GET";
    const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method === "POST") {
      pushBounded(insertCalls, { url, payload });
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    if (method === "PATCH") {
      pushBounded(patchCalls, { url, payload });
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as FetchFn;

  const real = createRealGoogleWalletClient(fakeCredentials, fakeFetch);
  return { ...real, insertCalls, patchCalls };
}
