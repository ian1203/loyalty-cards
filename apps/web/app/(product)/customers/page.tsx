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
import { PAGE_SIZE_OPTIONS, parsePage, parsePageSize, searchCustomersForSession } from "./logic";

// Arma "/customers?q=...&pageSize=...&page=..." — un solo lugar para que
// los links de paginación y de tamaño de página nunca queden inconsistentes
// entre sí (todos preservan q, la mayoría preserva pageSize, y "cambiar de
// búsqueda" o "cambiar pageSize" omiten `page` a propósito para resetear a
// la página 1 — ver el punto 5 del pedido).
function buildCustomersUrl(params: { q: string; pageSize: number; page?: number }): string {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  usp.set("pageSize", String(params.pageSize));
  if (params.page && params.page > 1) usp.set("page", String(params.page));
  return `/customers?${usp.toString()}`;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[]; pageSize?: string | string[] }>;
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

  const sp = await searchParams;
  const rawQ = sp.q;
  const q = (typeof rawQ === "string" ? rawQ : "").trim().slice(0, 100);
  const pageSize = parsePageSize(typeof sp.pageSize === "string" ? sp.pageSize : undefined);
  const requestedPage = parsePage(typeof sp.page === "string" ? sp.page : undefined);

  const searchResult = await searchCustomersForSession(session, q, { page: requestedPage, pageSize });
  const rows = searchResult.ok ? searchResult.rows : [];
  const total = searchResult.ok ? searchResult.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // URL manipulada o resultado que se achicó entre visitas (ej. clientes
  // borrados): la página pedida ya no existe. Redirige a la última válida
  // en vez de mostrar "sin resultados" siendo falso (sí hay resultados,
  // solo no en esa página) — mismo q/pageSize, page distinto.
  if (searchResult.ok && requestedPage > totalPages && total > 0) {
    redirect(buildCustomersUrl({ q, pageSize, page: totalPages }));
  }
  const page = Math.min(requestedPage, totalPages);

  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

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
            {/* Sin campo "page": buscar siempre resetea a la página 1.
                pageSize sí viaja, para no perder la elección del dueño al
                buscar. */}
            <input type="hidden" name="pageSize" value={pageSize} />
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
            <>
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

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {firstRow}–{lastRow} de {total}
                  </span>
                  <div className="flex items-center gap-1" role="group" aria-label="Clientes por página">
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <Button
                        key={size}
                        asChild
                        size="sm"
                        variant={size === pageSize ? "default" : "outline"}
                        aria-current={size === pageSize ? "true" : undefined}
                      >
                        <Link href={buildCustomersUrl({ q, pageSize: size })}>{size}</Link>
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {page <= 1 ? (
                    <Button size="sm" variant="outline" className="pointer-events-none opacity-50" asChild>
                      <span aria-disabled="true">Anterior</span>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildCustomersUrl({ q, pageSize, page: page - 1 })}>Anterior</Link>
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  {page >= totalPages ? (
                    <Button size="sm" variant="outline" className="pointer-events-none opacity-50" asChild>
                      <span aria-disabled="true">Siguiente</span>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildCustomersUrl({ q, pageSize, page: page + 1 })}>Siguiente</Link>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
