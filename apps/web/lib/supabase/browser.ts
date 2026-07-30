import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes de navegador (p.ej. el formulario de login). Solo
// usa la clave anon — segura de exponer al cliente, RLS y Auth deciden qué
// puede hacer.
//
// Acceso ESTÁTICO a process.env.NEXT_PUBLIC_* a propósito (nunca
// process.env[name] con un nombre dinámico): Next.js reemplaza estas
// referencias por su valor literal en tiempo de build para el bundle del
// navegador — solo puede hacerlo si ve la propiedad escrita tal cual, un
// helper con acceso dinámico (process.env[name]) rompe ese reemplazo y las
// variables llegan `undefined` en el cliente.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no están configurados.",
    );
  }

  return createBrowserClient(url, anonKey);
}
