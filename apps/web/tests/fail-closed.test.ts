import { describe, expect, it } from "vitest";
import { getVerifiedSession, requirePlatformAdmin, requireTenantSession } from "../lib/supabase/session";
import { createMemoryCookieJar } from "./support/testAuth";

// Paso (f) del endurecimiento de Fase 1: sin sesión / con una sesión
// inválida o corrupta, el único punto sancionado de lectura de identidad
// (getVerifiedSession, y sus wrappers requirePlatformAdmin/
// requireTenantSession) debe fallar cerrado — nunca lanzar una excepción sin
// capturar (eso terminaría en un 500 de Next.js, no en un 401/403 limpio) ni
// devolver, por accidente, algo que parezca una sesión válida.
//
// Nota sobre "sesión expirada": el Supabase local firma los access tokens
// con una clave asimétrica (ES256, JWKS por proyecto) — fabricar un JWT
// válidamente firmado pero con exp en el pasado requeriría la clave privada
// del proyecto, que no es algo a lo que un test deba tener acceso. La cookie
// corrupta/con firma inválida de abajo ejercita la misma propiedad de
// seguridad que realmente importa: getClaims() rechaza el token y
// getVerifiedSession() no debe tratarlo como autenticado — la causa exacta
// del rechazo (firma inválida vs. expiración) es indistinguible desde este
// punto y no cambia el comportamiento esperado.
describe("Fase 1 — fail-closed sin sesión o con sesión inválida", () => {
  it("sin cookies, getVerifiedSession() no revienta y devuelve authenticated: false", async () => {
    const jar = createMemoryCookieJar();
    const session = await getVerifiedSession(jar);
    expect(session).toEqual({ authenticated: false });
  });

  it("sin cookies, requirePlatformAdmin() y requireTenantSession() devuelven null", async () => {
    const jar = createMemoryCookieJar();
    expect(await requirePlatformAdmin(jar)).toBeNull();
    expect(await requireTenantSession(jar)).toBeNull();
  });

  it("con una cookie de sesión corrupta/con firma inválida, no revienta y falla cerrado", async () => {
    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
    const jar = createMemoryCookieJar([
      { name: `sb-${projectRef}-auth-token`, value: "not-a-real-session" },
    ]);

    const session = await getVerifiedSession(jar);
    expect(session).toEqual({ authenticated: false });
    expect(await requirePlatformAdmin(jar)).toBeNull();
    expect(await requireTenantSession(jar)).toBeNull();
  });

  it("con un JWT bien formado pero con firma inválida (mismo perfil que un token expirado/manipulado), falla cerrado", async () => {
    // Header + payload válidos en forma (incluyendo exp en el pasado), pero
    // sin firma real: exactamente lo que vería la app ante un token vencido
    // o manipulado, cualquiera sea la causa exacta del rechazo.
    const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: "00000000-0000-0000-0000-000000000099",
        business_id: "11111111-1111-1111-1111-111111111111",
        tenant_role: "owner",
        is_platform_admin: false,
        exp: Math.floor(Date.now() / 1000) - 3600,
        role: "authenticated",
      }),
    ).toString("base64url");
    const forgedToken = `${header}.${payload}.not-a-real-signature`;

    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
    const jar = createMemoryCookieJar([
      {
        name: `sb-${projectRef}-auth-token`,
        value: JSON.stringify({
          access_token: forgedToken,
          refresh_token: "forged-refresh-token",
          expires_at: Math.floor(Date.now() / 1000) - 3600,
          token_type: "bearer",
        }),
      },
    ]);

    const session = await getVerifiedSession(jar);
    expect(session.authenticated).toBe(false);
  });
});
