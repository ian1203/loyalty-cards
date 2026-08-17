"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { invitePlatformAdminAction } from "../accounts-actions";
import type { AdminActionState } from "../businesses-actions";

const initialState: AdminActionState = {};

export function InviteAccountForm() {
  const [state, formAction, pending] = useActionState(invitePlatformAdminAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platformRole">Rol</Label>
        <select id="platformRole" name="platformRole" className="rounded-md border bg-background px-3 py-2 text-sm" defaultValue="viewer">
          <option value="owner">Owner (control total)</option>
          <option value="viewer">Viewer (solo lectura)</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Invitando…" : "Invitar cuenta"}
      </Button>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <Alert>
          <AlertDescription>Invitación enviada.</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
