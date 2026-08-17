"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Logo } from "../../components/Logo";
import { createClient } from "../../lib/supabase/browser";

const MIN_PASSWORD_LENGTH = 6;

// A donde cae el dueño/admin después de hacer clic en el link de
// invitación o de recuperación de contraseña. Supabase redirige ahí con la
// sesión temporal codificada en el FRAGMENTO de la URL (#access_token=...)
// — ambos flujos (invitación por email, recuperación) son implícitos, no
// PKCE: no hay continuidad de "code_verifier" posible entre el cliente de
// correo (donde se hace clic) y este navegador.
//
// El cliente de @supabase/ssr fija flowType: "pkce" de forma fija (no se
// puede sobreescribir vía opciones) — su detección automática de sesión en
// la URL (detectSessionInUrl) por eso RECHAZA un fragmento implícito como
// este con AuthPKCEGrantCodeExchangeError, silenciosamente (nada en la app
// espera esa promesa interna). Por eso NO se puede confiar en la detección
// automática acá: se parsea el fragmento a mano.
//
// Hallazgo real de una revisión ofensiva a esta misma app: la versión
// anterior llamaba setSession() sobre el cliente de NAVEGADOR normal
// (createClient(), que persiste cookies reales vía @supabase/ssr) apenas
// cargaba la página — eso dejaba una sesión COMPLETA y navegable antes de
// que la persona escribiera ninguna contraseña. Quien abriera el link
// (buzón comprometido, un escáner de enlaces corporativo que "pre-visita"
// URLs de correos entrantes, una regla de reenvío maliciosa) ya tenía
// acceso completo con solo abrirlo — bastaba con teclear /admin o
// /dashboard en ese mismo navegador. Fix: la verificación del token y el
// cambio de contraseña corren sobre un cliente EN MEMORIA
// (persistSession: false, @supabase/supabase-js directo, nunca
// @supabase/ssr) que jamás toca cookies — solo se establece una sesión
// REAL y navegable (vía el cliente de navegador normal) DESPUÉS de que
// updateUser({password}) confirma éxito.
function createEphemeralClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no están configurados.");
  }
  return createSupabaseJsClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export default function SetPasswordPage() {
  const [ephemeralClient] = useState(() => createEphemeralClient());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      // Validación de un fragmento de URL solo disponible client-side (no se
      // puede mover a un lazy initializer sin romper SSR); es un guard
      // síncrono antes del flujo async de abajo, no estado derivable en
      // render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("El link de invitación no es válido o ya expiró.");
      return;
    }

    // setSession() acá SOLO llena el estado en memoria de ephemeralClient
    // (persistSession: false) — todavía no hay ninguna cookie real ni
    // sesión navegable en el resto de la app.
    ephemeralClient.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: setSessionError }) => {
        if (setSessionError) {
          setError(setSessionError.message);
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setSessionReady(true);
      });
  }, [ephemeralClient]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: updateError } = await ephemeralClient.auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      setError(updateError.message);
      return;
    }

    // Recién AHORA, con la contraseña ya confirmada, se persiste una
    // sesión real y navegable — vía el cliente de navegador normal
    // (cookies reales, mismo mecanismo que cualquier login de esta app).
    // getSession() (no los tokens originales del fragmento) por si
    // updateUser rotó el access/refresh token internamente.
    const { data: currentSession } = await ephemeralClient.auth.getSession();
    if (currentSession.session) {
      await createClient().auth.setSession({
        access_token: currentSession.session.access_token,
        refresh_token: currentSession.session.refresh_token,
      });
    }

    setPending(false);
    router.push("/dashboard");
    router.refresh();
  }

  // Link inválido/expirado: nada de formulario, ese estado nunca se puede
  // enviar (sessionReady jamás llega a true) — mejor un mensaje claro que un
  // form completo con el botón deshabilitado sin explicación.
  const linkInvalid = !sessionReady && error !== null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/50 to-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <Logo />
        <Card className="w-full shadow-token-md">
          <CardHeader>
            <CardTitle>Elige tu contraseña</CardTitle>
            <CardDescription>
              {linkInvalid
                ? "No pudimos verificar tu invitación."
                : "Último paso para activar tu cuenta."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkInvalid ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : !sessionReady ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-5 animate-spin" />
                Verificando tu invitación…
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo {MIN_PASSWORD_LENGTH} caracteres.
                  </p>
                </div>
                {error ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" disabled={pending} className="mt-1">
                  {pending ? "Guardando…" : "Guardar y entrar"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
