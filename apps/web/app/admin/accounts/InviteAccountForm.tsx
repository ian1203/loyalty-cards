"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useActionToast } from "../../../lib/useActionToast";
import { invitePlatformAdminAction } from "../accounts-actions";
import type { AdminActionState } from "../businesses-actions";

const initialState: AdminActionState = {};

// Mismo box model que Input (components/ui/input.tsx) — no existe un
// componente Select en shadcn/ui de este repo (mismo criterio ya usado en
// el <select> de sucursal de /team).
const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function InviteAccountForm() {
  const [state, formAction, pending] = useActionState(invitePlatformAdminAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state, initialState);

  useEffect(() => {
    if (state !== initialState && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platformRole">Rol</Label>
        <select id="platformRole" name="platformRole" className={SELECT_CLASS} defaultValue="viewer">
          <option value="owner">Owner (control total)</option>
          <option value="viewer">Viewer (acotado en /admin — acceso completo al impersonar)</option>
        </select>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Invitando…" : "Invitar cuenta"}
      </Button>
    </form>
  );
}
