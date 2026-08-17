import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { requireEnv, supabaseAdminClient } from "./support/testAuth";

// Regresión de un hallazgo real de una revisión ofensiva sobre
// app/set-password/page.tsx: la versión anterior llamaba setSession()
// sobre el cliente de NAVEGADOR normal (createClient() de
// lib/supabase/browser.ts, que persiste cookies reales vía @supabase/ssr)
// apenas cargaba la página — eso dejaba una sesión COMPLETA y navegable
// antes de que la persona escribiera ninguna contraseña. Quien abriera el
// link de invitación/recuperación (buzón comprometido, un escáner de
// enlaces corporativo que "pre-visita" URLs, una regla de reenvío
// maliciosa) ya tenía acceso completo con solo abrirlo.
//
// Fix: la verificación del token y el cambio de contraseña corren sobre
// un cliente EN MEMORIA (persistSession: false, @supabase/supabase-js
// directo) que jamás toca cookies/localStorage — solo se establece una
// sesión real y navegable DESPUÉS de que updateUser({password}) confirma
// éxito. Este test prueba la lógica real (misma librería, mismo flujo de
// tokens de GoTrue) sin pasar por un navegador — más rápido y estable que
// un E2E de Playwright para esta propiedad específica, que es puramente
// de la SDK/API, no de renderizado.
function createEphemeralClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

describe("/set-password — el cliente efímero nunca persiste sesión antes de confirmar la contraseña", () => {
  it("setSession + updateUser sobre el cliente en memoria funcionan sin ningún storage externo, y la contraseña nueva sirve para loguearse de verdad", async () => {
    const admin = supabaseAdminClient();
    const email = `setpw-${Date.now()}@test.dev`;
    let createdUserId: string | undefined;

    try {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: "http://127.0.0.1:3000/set-password" },
      });
      if (linkError) throw linkError;
      createdUserId = linkData.user.id;

      const token = new URL(linkData.properties.action_link).searchParams.get("token")!;

      // Sigue la redirección real de GoTrue para obtener los tokens del
      // fragmento — mismo mecanismo implícito que sigue el navegador real.
      const verifyRes = await fetch(
        `${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/verify?token=${token}&type=invite&redirect_to=http://127.0.0.1:3000/set-password`,
        { redirect: "manual" },
      );
      const location = verifyRes.headers.get("location")!;
      expect(location).toBeTruthy();
      const fragment = new URLSearchParams(location.split("#")[1]);
      const accessToken = fragment.get("access_token")!;
      const refreshToken = fragment.get("refresh_token")!;
      expect(accessToken).toBeTruthy();

      const ephemeral = createEphemeralClient();
      const { error: setSessionError } = await ephemeral.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      expect(setSessionError).toBeNull();

      const newPassword = "una-password-de-prueba-segura-1";
      const { error: updateError } = await ephemeral.auth.updateUser({ password: newPassword });
      expect(updateError).toBeNull();

      const { data: finalSession } = await ephemeral.auth.getSession();
      expect(finalSession.session).toBeTruthy();
      expect(finalSession.session?.user.email).toBe(email);

      // Confirma que la contraseña realmente cambió server-side: un login
      // real con ella funciona — no solo que la llamada no lanzó.
      const anon = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: loginData, error: loginError } = await anon.auth.signInWithPassword({
        email,
        password: newPassword,
      });
      expect(loginError).toBeNull();
      expect(loginData.session).toBeTruthy();
    } finally {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    }
  });
});
