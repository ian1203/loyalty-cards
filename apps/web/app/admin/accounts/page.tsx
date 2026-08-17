import { redirect } from "next/navigation";
import { UserPlusIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { PageHeader } from "../../../components/PageHeader";
import { getVerifiedSession } from "../../../lib/supabase/session";
import { listPlatformAdmins } from "../accounts";
import { AccountsList } from "./AccountsList";
import { InviteAccountForm } from "./InviteAccountForm";

export default async function AdminAccountsPage() {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.kind !== "platform_admin") {
    redirect("/dashboard");
  }

  const accounts = await listPlatformAdmins();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cuentas de plataforma"
        description="Quién tiene acceso al panel de admin y con qué rol."
        back={{ href: "/admin", label: "Negocios" }}
      />

      <AccountsList accounts={accounts} ownAuthUserId={session.authUserId} />

      {session.platformRole === "owner" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlusIcon className="size-4.5 text-muted-foreground" />
              Invitar cuenta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InviteAccountForm />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
