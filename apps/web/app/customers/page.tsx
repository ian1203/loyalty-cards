import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenantContext } from "@loyalty/db";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { requireTenantSession } from "../../lib/supabase/session";
import { CreateCustomerForm } from "./CreateCustomerForm";
import { searchCustomers } from "./logic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }

  const rawQ = (await searchParams).q;
  const q = (typeof rawQ === "string" ? rawQ : "").trim().slice(0, 100);

  const rows = await withTenantContext(session.businessId, (tx) =>
    searchCustomers(tx, session, q),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>

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
            Busca por nombre, teléfono o email dentro de tu negocio.
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

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {q
                ? `Sin resultados para "${q}" en tu negocio.`
                : "Todavía no hay clientes. Da de alta el primero con el formulario de arriba."}
            </p>
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
    </main>
  );
}
