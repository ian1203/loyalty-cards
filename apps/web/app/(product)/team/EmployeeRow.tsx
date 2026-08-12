"use client";

import { useActionState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { TableCell, TableRow } from "../../../components/ui/table";
import { useActionToast } from "../../../lib/useActionToast";
import { deactivateEmployeeAction } from "./actions";
import type { TeamActionState } from "./logic";

const initialState: TeamActionState = {};

type Employee = {
  id: string;
  fullName: string;
  isActive: boolean;
  userEmail: string | null;
  primaryLocationName: string | null;
};

export function EmployeeRow({ employee }: { employee: Employee }) {
  const [state, formAction, pending] = useActionState(deactivateEmployeeAction, initialState);
  useActionToast(state, initialState);

  return (
    <TableRow>
      <TableCell className="font-medium">{employee.fullName}</TableCell>
      <TableCell>{employee.userEmail ?? "Sin cuenta vinculada"}</TableCell>
      <TableCell>{employee.primaryLocationName ?? "Cualquier sucursal"}</TableCell>
      <TableCell>
        <Badge variant={employee.isActive ? "default" : "secondary"}>
          {employee.isActive ? "Activo" : "Desactivado"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {employee.isActive ? (
          <form
            action={formAction}
            onSubmit={(event) => {
              if (!window.confirm(`¿Desactivar a ${employee.fullName}? Perderá acceso al scanner.`)) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="employeeId" value={employee.id} />
            <Button type="submit" variant="ghost" size="sm" disabled={pending}>
              {pending ? "Desactivando…" : "Desactivar"}
            </Button>
          </form>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
