"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/browser";

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

  return (
    <main>
      <h1>Elige tu contraseña</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
        </div>
        <button type="submit" disabled={pending || !sessionReady}>
          {pending ? "Guardando…" : "Guardar y entrar"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </main>
  );
}
