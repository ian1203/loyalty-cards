"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Logo } from "../../components/Logo";
import { createClient } from "../../lib/supabase/browser";

const MIN_PASSWORD_LENGTH = 6;

// A donde cae el dueño después de hacer clic en el link de invitación.
// Supabase redirige ahí con la sesión temporal codificada en el FRAGMENTO de
// la URL (#access_token=...) — el flujo de invitación por email es
// implícito, no PKCE: no hay continuidad de "code_verifier" posible entre
// el cliente de correo (donde se hace clic) y este navegador.
//
// El cliente de @supabase/ssr fija flowType: "pkce" de forma fija (no se
// puede sobreescribir vía opciones) — su detección automática de sesión en
// la URL (detectSessionInUrl) por eso RECHAZA un fragmento implícito como
// este con AuthPKCEGrantCodeExchangeError, silenciosamente (nada en la app
// espera esa promesa interna). Por eso NO se puede confiar en la detección
// automática acá: se parsea el fragmento a mano y se establece la sesión con
// setSession() explícito, antes de que el dueño pueda guardar su contraseña.
export default function SetPasswordPage() {
  const [supabase] = useState(() => createClient());
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
      // render. Tocar este flujo de auth (invitación de dueño) está fuera de
      // alcance de esta tarea.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("El link de invitación no es válido o ya expiró.");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: setSessionError }) => {
        if (setSessionError) {
          setError(setSessionError.message);
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setSessionReady(true);
      });
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

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
