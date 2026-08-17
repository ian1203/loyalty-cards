import Link from "next/link";
import { redirect } from "next/navigation";
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
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground underline">
          ← Negocios
        </Link>
        <h1 className="text-2xl font-semibold">Cuentas de plataforma</h1>
      </div>

      <section className="flex flex-col gap-3">
        <AccountsList accounts={accounts} ownAuthUserId={session.authUserId} />
      </section>

      {session.platformRole === "owner" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Invitar cuenta</h2>
          <InviteAccountForm />
        </section>
      ) : null}
    </main>
  );
}
