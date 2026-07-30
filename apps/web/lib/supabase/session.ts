import type { CookieMethodsServer } from "@supabase/ssr";
import type { VerifiedBusinessId } from "@loyalty/db";
import { createClient } from "./server";

export type TenantRole = "owner" | "admin" | "staff";

const TENANT_ROLES: ReadonlySet<string> = new Set<TenantRole>([
  "owner",
  "admin",
  "staff",
]);

export type VerifiedSession =
  | { authenticated: false }
  | { authenticated: true; kind: "platform_admin"; authUserId: string }
  | {
      authenticated: true;
      kind: "tenant_user";
      authUserId: string;
      businessId: VerifiedBusinessId;
      role: TenantRole;
      locationId: string | null;
    };

// Único punto de entrada sancionado para leer quién es el usuario actual.
// Usa getClaims(), NO getSession(): getClaims() verifica la firma del JWT
// (localmente vía WebCrypto si el proyecto usa claves asimétricas, o contra
// el servidor de Auth si no) antes de devolver los claims — getSession()
// simplemente lee la cookie sin re-verificar nada, lo cual sería confiar en
// un input del cliente. Los claims personalizados (business_id, tenant_role,
// location_id, is_platform_admin) los inyecta
// public.custom_access_token_hook (ver packages/db/migrations) — no existen
// en ningún otro lugar, así que sin este método no hay forma de leerlos de
// forma confiable.
export async function getVerifiedSession(
  cookieMethods?: CookieMethodsServer,
): Promise<VerifiedSession> {
  const supabase = await createClient(cookieMethods);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    return { authenticated: false };
  }

  const claims = data.claims as Record<string, unknown>;
  const authUserId = typeof claims.sub === "string" ? claims.sub : undefined;
  if (!authUserId) {
    return { authenticated: false };
  }

  if (claims.is_platform_admin === true) {
    return { authenticated: true, kind: "platform_admin", authUserId };
  }

  const businessId =
    typeof claims.business_id === "string" ? claims.business_id : null;
  // "tenant_role", no "role": ese nombre ya lo reserva GoTrue para su propio
  // claim de sistema (ver comentario en la migración del hook).
  const role =
    typeof claims.tenant_role === "string" && TENANT_ROLES.has(claims.tenant_role)
      ? (claims.tenant_role as TenantRole)
      : null;

  if (!businessId || !role) {
    // Sesión válida (JWT bien firmado) pero sin negocio asociado — p.ej. un
    // auth.users que existe pero no tiene fila en public.users (nunca pasó
    // por /admin), o un usuario desactivado (is_active = false, el hook no
    // le pone business_id/tenant_role a propósito). Ni admin ni tenant_user:
    // fail closed, no autenticado a efectos de esta app.
    return { authenticated: false };
  }

  const locationId =
    typeof claims.location_id === "string" ? claims.location_id : null;

  return {
    authenticated: true,
    kind: "tenant_user",
    authUserId,
    businessId: businessId as VerifiedBusinessId,
    role,
    locationId,
  };
}

export async function requirePlatformAdmin(
  cookieMethods?: CookieMethodsServer,
): Promise<{ authUserId: string } | null> {
  const session = await getVerifiedSession(cookieMethods);
  if (!session.authenticated || session.kind !== "platform_admin") {
    return null;
  }
  return { authUserId: session.authUserId };
}

export async function requireTenantSession(
  cookieMethods?: CookieMethodsServer,
): Promise<Extract<VerifiedSession, { kind: "tenant_user" }> | null> {
  const session = await getVerifiedSession(cookieMethods);
  if (!session.authenticated || session.kind !== "tenant_user") {
    return null;
  }
  return session;
}
