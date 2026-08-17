"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Button } from "../../../../components/ui/button";
import type { PlatformRole } from "../../../../lib/supabase/session";
import { startImpersonationAction, type ImpersonationActionState } from "../../impersonation-actions";

const initialState: ImpersonationActionState = {};

// Un solo botón, la etiqueta depende del ROL PROPIO del admin — no hay
// elección: un admin owner siempre impersona con acceso completo, un
// viewer siempre en modo lectura (ver startImpersonation, que usa
// admin.platformRole, nunca un valor que este componente pudiera mandar).
export function ImpersonateButton({
  businessId,
  ownPlatformRole,
}: {
  businessId: string;
  ownPlatformRole: PlatformRole;
}) {
  const boundAction = startImpersonationAction.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending}>
        {pending
          ? "Entrando…"
          : ownPlatformRole === "owner"
            ? "Entrar como dueño"
            : "Ver como viewer (solo lectura)"}
      </Button>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
