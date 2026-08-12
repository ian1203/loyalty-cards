import { redirect } from "next/navigation";
import { withTenantContext } from "@loyalty/db";
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
import { EmployeeRow } from "./EmployeeRow";
import { listEmployeesForSession } from "./logic";

// Gestión de empleados: alcance de esta pantalla es SOLO desactivar (ver
// plan de endurecimiento de seguridad) — no hay alta de empleados ni
// reactivación todavía. staff = solo /scanner, igual que /rewards: esto es
// más sensible que la config del programa, mismo rebote server-side.
export default async function TeamPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "staff") {
    redirect("/scanner");
  }

  const employees = await withTenantContext(session.businessId, (tx) =>
    listEmployeesForSession(tx, session),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Equipo"
        description="Empleados del negocio y su acceso al scanner."
      />

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
