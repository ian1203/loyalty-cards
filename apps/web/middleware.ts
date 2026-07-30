import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Único trabajo de este middleware: mantener viva la sesión de Supabase
// (refrescar el access token si venció, usando el refresh token) y dejar
// las cookies actualizadas en la respuesta. NO resuelve tenant ni toma
// ninguna decisión de autorización aquí — eso pasa en runtime Node (route
// handlers/server components), vía getVerifiedSession() en
// lib/supabase/session.ts, que verifica la firma del JWT y lee los claims
// reales (business_id/role/location_id/is_platform_admin).
//
// El placeholder de Fase 0 (header x-business-id reenviado como
// x-tenant-business-id) se retira por completo: ya no hay ninguna vía de
// tenant por header, ese era exactamente el TODO que resuelve esta fase.
//
// Este middleware corre en el runtime Edge de Next.js, que no soporta el
// driver `pg` (TCP nativo de Node) — por eso nunca importa @loyalty/db ni
// llama a withTenantContext() aquí, y por lo que no puede (ni debe) ser el
// lugar donde se decide autorización.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Dispara el refresh de sesión si el access token venció; las cookies
  // actualizadas quedan escritas en `response` vía el setAll de arriba.
  await supabase.auth.getUser();

  return response;
}
