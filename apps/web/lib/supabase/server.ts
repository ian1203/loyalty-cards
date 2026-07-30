import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function defaultCookieMethods(): Promise<CookieMethodsServer> {
  const cookieStore = await cookies();

  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Los Server Components no pueden escribir cookies — no pasa
        // nada, el middleware ya se encarga de refrescar la sesión.
      }
    },
  };
}

// Cliente para runtime Node (route handlers, server actions, server
// components) con la sesión del usuario — respeta RLS/Auth normalmente.
// Nunca usar esto para operaciones de admin (crear negocios, invitar
// dueños) — para eso está createAdminClient().
//
// cookieMethods es opcional y por defecto lee/escribe con next/headers
// cookies() — solo se provee explícitamente en el test de aislamiento
// (apps/web/tests/e2e-isolation.test.ts), que corre fuera del scope de
// request de Next.js (cookies() revienta ahí) y necesita un jar de cookies
// en memoria para ejercitar esta misma función contra una sesión real y
// firmada, sin levantar next dev/start.
export async function createClient(cookieMethods?: CookieMethodsServer) {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies: cookieMethods ?? (await defaultCookieMethods()) },
  );
}

// Cliente con la clave de servicio: bypassa RLS y Auth por completo. SOLO
// para el camino confinado de /admin (ver apps/web/app/admin/actions.ts) —
// nunca para servir una request normal. No maneja cookies ni sesión de
// usuario, es una identidad de servicio fija.
export function createAdminClient() {
  return createSupabaseJsClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
