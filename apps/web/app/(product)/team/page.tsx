import { redirect } from "next/navigation";
import { asc, eq, and } from "drizzle-orm";
import { locations, withTenantContext } from "@loyalty/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { requireTenantSession } from "../../../lib/supabase/session";
import { CreateStaffForm } from "./CreateStaffForm";
import { EmployeeRow } from "./EmployeeRow";
import { listEmployeesForSession } from "./logic";

// Gestión de empleados: desactivar (endurecimiento de seguridad) + alta de
// staff (password generado localmente, mostrado una sola vez) — sin
// reactivación todavía. staff = solo /scanner, igual que /rewards: esto es
// más sensible que la config del programa, mismo rebote server-side. Este
// mismo formulario de alta es el camino que un platform admin
// impersonando "owner" usa para dar de alta staff sin código nuevo en
// /admin.
export default async function TeamPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "staff") {
    redirect("/scanner");
  }

  const { employees, activeLocations } = await withTenantContext(
    session.businessId,
    async (tx) => {
      const employees = await listEmployeesForSession(tx, session);
      const activeLocations = await tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(and(eq(locations.businessId, session.businessId), eq(locations.isActive, true)))
        .orderBy(asc(locations.name));
      return { employees, activeLocations };
    },
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Equipo"
        description="Empleados del negocio, su acceso al scanner y el alta de staff nuevo."
      />

      <Card>
        <CardHeader>
          <CardTitle>Dar de alta staff</CardTitle>
          <CardDescription>
            Genera una cuenta real con acceso al scanner. La contraseña se muestra una sola vez —
            cópiala y entrégasela al empleado por un canal seguro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateStaffForm locations={activeLocations} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empleados</CardTitle>
          <CardDescription>
            Desactivar bloquea el sellado/canje de inmediato y el login futuro de la cuenta vinculada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <EmptyState
              title="Todavía no hay empleados"
              description="Las fichas de empleado se crean al dar de alta staff en tu negocio."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <EmployeeRow key={employee.id} employee={employee} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
