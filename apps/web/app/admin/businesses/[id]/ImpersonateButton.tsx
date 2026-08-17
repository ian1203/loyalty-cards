"use client";

import { useActionState } from "react";
import { LogInIcon } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { useActionToast } from "../../../../lib/useActionToast";
import { startImpersonationAction, type ImpersonationActionState } from "../../impersonation-actions";

const initialState: ImpersonationActionState = {};

// Mismo botón para ambos roles de plataforma — owner y viewer impersonan
// con acceso completo (pedido explícito, ver comentario en
// startImpersonation, app/admin/impersonation.ts).
export function ImpersonateButton({ businessId }: { businessId: string }) {
  const boundAction = startImpersonationAction.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  useActionToast(state, initialState);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        <LogInIcon />
        {pending ? "Entrando…" : "Entrar como dueño"}
      </Button>
    </form>
  );
}
