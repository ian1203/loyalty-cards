import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { requireTenantSession } from "../../../lib/supabase/session";
import { CreateCustomerForm } from "./CreateCustomerForm";
import { searchCustomersForSession } from "./logic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }

  // staff = solo /scanner — el directorio administrativo de clientes
  // (nombre/teléfono/email de todo el negocio) no le corresponde. Real a
  // nivel servidor: antes de este chequeo, la query de abajo ya corría
  // para cualquier tenant_user.
  if (session.role === "staff") {
    redirect("/scanner");
  }

  const rawQ = (await searchParams).q;
  const q = (typeof rawQ === "string" ? rawQ : "").trim().slice(0, 100);

  const searchResult = await searchCustomersForSession(session, q);
  const rows = searchResult.ok ? searchResult.rows : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Clientes" description="Directorio del negocio y alta manual de nuevos clientes." />

      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
          <CardDescription>
            Alta manual: crea la tarjeta de sellos del cliente con saldo en cero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCustomerForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Directorio</CardTitle>
          <CardDescription>
            Busca por nombre, teléfono o email exacto dentro de tu negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" className="flex items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder="Buscar cliente…"
              className="max-w-sm"
            />
            <Button type="submit" variant="outline">
              Buscar
            </Button>
            {q ? (
              <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
                Limpiar
              </Link>
            ) : null}
          </form>

          {!searchResult.ok ? (
            <EmptyState title="Demasiadas búsquedas" description={searchResult.error} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={q ? "Sin resultados" : "Todavía no hay clientes"}
              description={
                q
                  ? `Nadie coincide exactamente con "${q}" en tu negocio — revisa la ortografía o el dato completo.`
                  : "Da de alta al primero con el formulario de arriba para empezar a sellar tarjetas."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Alta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {customer.fullName ?? "(sin nombre)"}
                      </Link>
                    </TableCell>
                    <TableCell>{customer.phone ?? "—"}</TableCell>
                    <TableCell>{customer.email ?? "—"}</TableCell>
                    <TableCell>
                      {customer.createdAt.toLocaleDateString("es-MX", {
                        dateStyle: "medium",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
