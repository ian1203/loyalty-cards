import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { walletPasses, type VerifiedBusinessId } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { isUuid } from "../tenant";

// Igual que getVerifiedSession() (apps/web/lib/supabase/session.ts) es el
// único lugar que castea VerifiedBusinessId a partir de un JWT de
// Supabase, esta función es el ÚNICO OTRO lugar autorizado — a partir de
// un authenticationToken de PassKit en vez de una sesión. El web service
// de Apple es público (Apple llama desde el iPhone sin sesión de
// Supabase); acá la identidad es 100% el authenticationToken del pase.
//
// adminDb se usa EXCLUSIVAMENTE para esta única fila (nunca para servir
// el resto del request): matching por id (serialNumber de la URL) +
// comparación de authenticationToken en tiempo constante
// (crypto.timingSafeEqual — evita filtrar por timing cuántos bytes del
// token coinciden). A partir de acá, TODO lo demás usa
// withTenantContext/RLS — jamás adminDb para datos de negocio.
//
// (Excepción documentada aparte: listUpdatedSerialsForDevice en
// apps/web/app/api/wallet/apple/logic.ts SÍ necesita una segunda consulta
// vía adminDb, porque ese endpoint específico de Apple no manda
// authenticationToken — ver el comentario ahí.)
export async function verifyBusinessIdForPassToken(
  serialNumber: string,
  authenticationToken: string,
): Promise<{ businessId: VerifiedBusinessId; walletPassId: string } | null> {
  if (!isUuid(serialNumber) || !authenticationToken) {
    return null;
  }

  // platform='apple' explícito (hallazgo de revisión): sin esto, el token
  // del pase GOOGLE de un cliente autenticaría contra el web service de
  // APPLE para ese mismo id — no es fuga cross-tenant, pero sí escalada de
  // una credencial a otra que nunca debió aceptar. Cada plataforma
  // verifica solo su propio token.
  const [row] = await adminDb
    .select({
      id: walletPasses.id,
      businessId: walletPasses.businessId,
      authenticationToken: walletPasses.authenticationToken,
    })
    .from(walletPasses)
    .where(and(eq(walletPasses.id, serialNumber), eq(walletPasses.platform, "apple")))
    .limit(1);

  if (!row) {
    return null;
  }

  // Los tokens los genera siempre crypto.randomBytes(24).toString("base64url")
  // (misma longitud fija) — comparar longitud antes de timingSafeEqual no
  // filtra nada práctico (timingSafeEqual además exige buffers del mismo
  // tamaño o lanza).
  const provided = Buffer.from(authenticationToken, "utf8");
  const expected = Buffer.from(row.authenticationToken, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  return { businessId: row.businessId as VerifiedBusinessId, walletPassId: row.id };
}
