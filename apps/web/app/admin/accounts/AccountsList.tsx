"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  changePlatformAdminRoleAction,
  setPlatformAdminActiveAction,
} from "../accounts-actions";

type Account = {
  authUserId: string;
  email: string;
  platformRole: "owner" | "viewer";
  isActive: boolean;
};

export function AccountsList({ accounts, ownAuthUserId }: { accounts: Account[]; ownAuthUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive(authUserId: string, isActive: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setPlatformAdminActiveAction(authUserId, isActive);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function toggleRole(authUserId: string, platformRole: "owner" | "viewer") {
    setError(null);
    startTransition(async () => {
      const result = await changePlatformAdminRoleAction(authUserId, platformRole);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col divide-y rounded-lg border">
        {accounts.map((account) => (
          <div key={account.authUserId} className="flex items-center justify-between gap-3 p-4">
            <div className="flex flex-col">
              <span className="font-medium">
                {account.email}
                {account.authUserId === ownAuthUserId ? " (tú)" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{account.platformRole === "owner" ? "Owner" : "Viewer"}</Badge>
                <Badge variant={account.isActive ? "secondary" : "destructive"}>
                  {account.isActive ? "Activa" : "Desactivada"}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => toggleRole(account.authUserId, account.platformRole === "owner" ? "viewer" : "owner")}
              >
                {account.platformRole === "owner" ? "Pasar a viewer" : "Pasar a owner"}
              </Button>
              <Button
                type="button"
                variant={account.isActive ? "destructive" : "outline"}
                size="sm"
                disabled={pending}
                onClick={() => toggleActive(account.authUserId, !account.isActive)}
              >
                {account.isActive ? "Desactivar" : "Reactivar"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
