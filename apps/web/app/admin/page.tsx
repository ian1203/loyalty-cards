import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "../../lib/supabase/session";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { CreateBusinessForm } from "./CreateBusinessForm";
import { listBusinesses } from "./businesses";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  unpaid: "Pago pendiente",
};

export default async function AdminPage() {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.kind !== "platform_admin") {
    redirect("/dashboard");
  }

  const businesses = await listBusinesses();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Panel de admin de plataforma</h1>
        <Button asChild variant="outline">
          <Link href="/admin/accounts">Cuentas de plataforma</Link>
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Negocios</h2>
        <div className="flex flex-col divide-y rounded-lg border">
          {businesses.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin negocios todavía.</p>
          ) : (
            businesses.map((business) => (
              <Link
                key={business.id}
                href={`/admin/businesses/${business.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{business.name}</span>
                  <span className="text-sm text-muted-foreground">{business.slug}</span>
                </div>
                <Badge variant={business.status === "active" ? "secondary" : "destructive"}>
                  {STATUS_LABEL[business.status] ?? business.status}
                </Badge>
              </Link>
            ))
          )}
        </div>
      </section>

      {session.platformRole === "owner" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Alta de negocio</h2>
          <CreateBusinessForm />
        </section>
      ) : null}
    </main>
  );
}
