import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { getVerifiedSession } from "../../lib/supabase/session";
import { listRecentPlatformActivity } from "./activity";
import { CreateBusinessForm } from "./CreateBusinessForm";
import { RecentActivity } from "./RecentActivity";
import { listBusinesses } from "./businesses";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  unpaid: "Pago pendiente",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "secondary" : "destructive"}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export default async function AdminPage() {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.kind !== "platform_admin") {
    redirect("/dashboard");
  }

  const businesses = await listBusinesses();
  const activity = await listRecentPlatformActivity();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Negocios"
        description="Todos los negocios activos en la plataforma."
      />

      <Card>
        <CardContent className="p-0">
          {businesses.length === 0 ? (
            <EmptyState
              className="py-12"
              title="Sin negocios todavía"
              description="Da de alta el primero desde el formulario de abajo."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negocio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((business) => (
                  <TableRow key={business.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/admin/businesses/${business.id}`}
                        className="flex flex-col gap-0.5 px-2 py-2.5"
                      >
                        <span className="font-medium">{business.name}</span>
                        <span className="text-sm text-muted-foreground">{business.slug}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/businesses/${business.id}`} className="block py-2.5">
                        <StatusBadge status={business.status} />
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">
                      <Link href={`/admin/businesses/${business.id}`} className="block py-2.5">
                        {business.plan}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {session.platformRole === "owner" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusIcon className="size-4.5" />
              Alta de negocio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreateBusinessForm />
          </CardContent>
        </Card>
      ) : null}

      <RecentActivity activity={activity} />
    </div>
  );
}
