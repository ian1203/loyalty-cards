"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
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

  function toggleActive(authUserId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setPlatformAdminActiveAction(authUserId, isActive);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Listo.");
        router.refresh();
      }
    });
  }

  function toggleRole(authUserId: string, platformRole: "owner" | "viewer") {
    startTransition(async () => {
      const result = await changePlatformAdminRoleAction(authUserId, platformRole);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Listo.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col divide-y">
          {accounts.map((account) => (
            <div
              key={account.authUserId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
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
                  onClick={() =>
                    toggleRole(account.authUserId, account.platformRole === "owner" ? "viewer" : "owner")
                  }
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
      </CardContent>
    </Card>
  );
}
