// Lógica del web service PÚBLICO de PassKit — SIN sesión de Supabase (ver
// .claude/skills/wallet-integration/SKILL.md). Recibe primitivos ya
// parseados por el route.ts (params + headers), nunca un Request/Response
// — mismo espíritu que logic.ts en /rewards, /customers, /scanner: se
// testea llamando la función directo. Todas las respuestas de este
// archivo van con Cache-Control: no-store (regla no negociable — un pase
// es dato de tenant, nunca se cachea).
import { and, eq, gt } from "drizzle-orm";
import { deviceRegistrations, walletPasses, withTenantContext } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { getApplePassTypeIdentifier } from "../../../../lib/wallet/adapters";
import { verifyBusinessIdForPassToken } from "../../../../lib/wallet/passAuth";
import { buildApplePkpassFromInputs, loadApplePassGenerationInputs } from "../../../../lib/wallet/passGeneration";

export type WalletApiResult = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

const NO_STORE = { "cache-control": "no-store" };

// 401 genérico para CUALQUIER fallo de auth (token no coincide, pase no
// existe, passTypeIdentifier ajeno) — mismo mensaje/código sin importar la
// causa real, para no darle a un atacante una señal de "casi acertaste"
// (mismo principio anti-oráculo que findInTenant en el resto de la app).
const UNAUTHORIZED: WalletApiResult = { status: 401, headers: NO_STORE };

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^ApplePass (.+)$/.exec(authorizationHeader);
  return match?.[1] ?? null;
}

// POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
export async function registerDeviceForPass(input: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  authorizationHeader: string | null;
  pushToken: string;
  clientIp: string;
}): Promise<WalletApiResult> {
  // Rate limit por IP ANTES de tocar el token — sin sesión acá (protocolo
  // público de Apple), la IP es la única señal disponible (ver
  // lib/rateLimit.ts). Corre antes de extractBearerToken/verifyBusinessIdForPassToken
  // a propósito: protege contra fuerza bruta del authenticationToken, no
  // solo contra abuso post-autenticación.
  const rate = await checkRateLimit("apple_webservice_ip", input.clientIp);
  if (!rate.allowed) {
    return { status: 429, headers: NO_STORE };
  }

  const token = extractBearerToken(input.authorizationHeader);
  if (!token || input.passTypeIdentifier !== getApplePassTypeIdentifier()) {
    return UNAUTHORIZED;
  }
  if (!input.deviceLibraryIdentifier || !input.pushToken) {
    return { status: 400, headers: NO_STORE };
  }

  const auth = await verifyBusinessIdForPassToken(input.serialNumber, token);
  if (!auth) {
    return UNAUTHORIZED;
  }

  return withTenantContext(auth.businessId, async (tx) => {
    // onConflictDoUpdate: registro idempotente (Apple re-registra el mismo
    // dispositivo sin quejarse — ver constraint unique en el schema).
    // Apple acepta 200 o 201 como éxito por igual; no distinguimos
    // insert-vs-update para no complicar la query, ver comentario en
    // packages/db/src/schema/deviceRegistrations.ts.
    await tx
      .insert(deviceRegistrations)
      .values({
        businessId: auth.businessId,
        walletPassId: auth.walletPassId,
        deviceLibraryIdentifier: input.deviceLibraryIdentifier,
        pushToken: input.pushToken,
      })
      .onConflictDoUpdate({
        target: [deviceRegistrations.deviceLibraryIdentifier, deviceRegistrations.walletPassId],
        set: { pushToken: input.pushToken },
      });
    return { status: 200, headers: NO_STORE };
  });
}

// DELETE /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
export async function unregisterDeviceForPass(input: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  authorizationHeader: string | null;
  clientIp: string;
}): Promise<WalletApiResult> {
  const rate = await checkRateLimit("apple_webservice_ip", input.clientIp);
  if (!rate.allowed) {
    return { status: 429, headers: NO_STORE };
  }

  const token = extractBearerToken(input.authorizationHeader);
  if (!token || input.passTypeIdentifier !== getApplePassTypeIdentifier()) {
    return UNAUTHORIZED;
  }

  const auth = await verifyBusinessIdForPassToken(input.serialNumber, token);
  if (!auth) {
    return UNAUTHORIZED;
  }

  return withTenantContext(auth.businessId, async (tx) => {
    await tx
      .delete(deviceRegistrations)
      .where(
        and(
          eq(deviceRegistrations.businessId, auth.businessId),
          eq(deviceRegistrations.walletPassId, auth.walletPassId),
          eq(deviceRegistrations.deviceLibraryIdentifier, input.deviceLibraryIdentifier),
        ),
      );
    return { status: 200, headers: NO_STORE };
  });
}

// GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince=
//
// EXCEPCIÓN DOCUMENTADA a "adminDb solo para la fila de auth en
// passAuth.ts": este endpoint específico del protocolo de Apple NO manda
// authenticationToken (está scoped por dispositivo, no por pase — es el
// propio diseño del protocolo, no una decisión nuestra) y en principio un
// mismo dispositivo puede tener pases registrados de MÁS DE UN negocio
// (varios clientes de la plataforma en el mismo iPhone), así que no hay
// una sola sesión de tenant que fijar de antemano. Se resuelve con una
// query MUY acotada vía adminDb: solo lee wallet_passes.id (serial number,
// un UUID opaco) y su updated_at — NUNCA nombre de negocio, datos de
// cliente, ni ninguna otra columna. El deviceLibraryIdentifier en sí solo
// se conoce si el dispositivo ya se registró con éxito antes (lo cual sí
// exigió un authenticationToken válido en el paso anterior) — no es un
// valor público/adivinable.
//
// Limitación aceptada (hallazgo BAJO de revisión, no corregido a
// propósito): sin rate limiting propio. El dato expuesto es mínimo
// (UUIDs opacos + timestamps, cero PII/datos de negocio) y el
// deviceLibraryIdentifier no es adivinable — el costo de otro subsistema
// de rate limiting no es proporcional a ese riesgo residual. Si esto
// cambia (p.ej. se agrega más metadata a la respuesta), replicar el
// limitador de scanner/logic.ts acá.
export async function listUpdatedSerialsForDevice(input: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  passesUpdatedSince?: string;
}): Promise<WalletApiResult> {
  if (input.passTypeIdentifier !== getApplePassTypeIdentifier()) {
    return { status: 204, headers: NO_STORE };
  }

  const since = input.passesUpdatedSince ? new Date(input.passesUpdatedSince) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const rows = await adminDb
    .select({ serialNumber: walletPasses.id, updatedAt: walletPasses.updatedAt })
    .from(walletPasses)
    .innerJoin(
      deviceRegistrations,
      and(
        eq(deviceRegistrations.walletPassId, walletPasses.id),
        eq(deviceRegistrations.businessId, walletPasses.businessId),
      ),
    )
    .where(
      and(
        eq(deviceRegistrations.deviceLibraryIdentifier, input.deviceLibraryIdentifier),
        eq(walletPasses.platform, "apple"),
        validSince ? gt(walletPasses.updatedAt, validSince) : undefined,
      ),
    );

  if (rows.length === 0) {
    return { status: 204, headers: NO_STORE };
  }

  const lastUpdated = rows
    .reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), rows[0].updatedAt)
    .toISOString();

  return {
    status: 200,
    headers: NO_STORE,
    body: { lastUpdated, serialNumbers: rows.map((r) => r.serialNumber) },
  };
}

// GET /v1/passes/{passTypeIdentifier}/{serialNumber}
export async function getLatestPass(input: {
  passTypeIdentifier: string;
  serialNumber: string;
  authorizationHeader: string | null;
  clientIp: string;
}): Promise<WalletApiResult> {
  const rate = await checkRateLimit("apple_webservice_ip", input.clientIp);
  if (!rate.allowed) {
    return { status: 429, headers: NO_STORE };
  }

  const token = extractBearerToken(input.authorizationHeader);
  if (!token || input.passTypeIdentifier !== getApplePassTypeIdentifier()) {
    return UNAUTHORIZED;
  }

  const auth = await verifyBusinessIdForPassToken(input.serialNumber, token);
  if (!auth) {
    return UNAUTHORIZED;
  }

  // FASE 1, dentro de la tx: solo DB. FASE 2 (fetches de red + firma
  // PKCS#7) corre DESPUÉS, fuera de withTenantContext — mismo criterio
  // que downloadApplePassForSession (ver docs/HISTORY.md). "row ausente"
  // (401, token no corresponde a ningún pase) y "no se pudo generar"
  // (404, mismo status que antes de este split) son casos distintos —
  // preservados por separado, no colapsados en un solo "ok: false".
  const loaded = await withTenantContext(auth.businessId, async (tx) => {
    const [row] = await tx
      .select({ customerId: walletPasses.customerId, updatedAt: walletPasses.updatedAt })
      .from(walletPasses)
      .where(and(eq(walletPasses.id, auth.walletPassId), eq(walletPasses.businessId, auth.businessId)))
      .limit(1);
    if (!row) {
      return { status: "unauthorized" as const };
    }
    const inputs = await loadApplePassGenerationInputs(tx, auth.businessId, row.customerId);
    if (!inputs.ok) {
      return { status: "not_found" as const };
    }
    return { status: "ok" as const, inputs: inputs.inputs, updatedAt: row.updatedAt };
  });
  if (loaded.status === "unauthorized") {
    return UNAUTHORIZED;
  }
  if (loaded.status === "not_found") {
    return { status: 404, headers: NO_STORE };
  }

  let result;
  try {
    result = await buildApplePkpassFromInputs(auth.businessId, loaded.inputs);
  } catch (error) {
    console.error("getLatestPass:", error);
    return { status: 404, headers: NO_STORE };
  }

  return {
    status: 200,
    body: result.pkpass,
    // Last-Modified: exigido por el protocolo de PassKit — bug real
    // encontrado vía POST /v1/log de un dispositivo real (mismo
    // hallazgo que el de las keys duplicadas): sin este header, el
    // dispositivo reporta "Server returned the pass data... but did
    // not provide a 'last-modified' header" — walletPasses.updatedAt
    // ya es el mismo timestamp que passesUpdatedSince usa para "qué
    // cambió" (ver el comentario en notify.ts), así que es la fuente
    // correcta, no un valor nuevo que mantener sincronizado aparte.
    headers: {
      ...NO_STORE,
      "content-type": "application/vnd.apple.pkpass",
      "last-modified": loaded.updatedAt.toUTCString(),
    },
  };
}

// POST /v1/log — best-effort, Apple no espera nada más que 200. Público y
// sin auth (así lo define el protocolo), así que el contenido es input
// crudo de un atacante potencial: se acota a 2000 chars y se limpian
// caracteres de control (saltos de línea, etc.) antes de loguear, para que
// nadie pueda inyectar líneas de log falsas ni inflar el volumen con
// bytes de control.
function sanitizeForLog(value: string): string {
  // Caracteres de control a propósito: se borran, no se interpretan.
  return value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 2000);
}

export async function logDeviceErrors(logs: unknown): Promise<WalletApiResult> {
  console.warn("[wallet:apple:device-log]", sanitizeForLog(JSON.stringify(logs)));
  return { status: 200, headers: NO_STORE };
}
