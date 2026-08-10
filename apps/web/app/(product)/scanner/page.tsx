import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { employees, locations, loyaltyPrograms, withTenantContext } from "@loyalty/db";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { requireTenantSession } from "../../../lib/supabase/session";
import { resolveActor } from "../../../lib/tenant";
import { ScannerClient } from "./ScannerClient";

export default async function ScannerPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }

  const { program, activeLocations, autoSelectedLocationId } = await withTenantContext(
    session.businessId,
    async (tx) => {
      const [program] = await tx
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.businessId, session.businessId))
        .orderBy(asc(loyaltyPrograms.createdAt))
        .limit(1);

      const activeLocations = await tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(
          and(
            eq(locations.businessId, session.businessId),
            eq(locations.isActive, true),
          ),
        )
        .orderBy(asc(locations.name));

      // Salto condicional de la pantalla "Selecciona tu sucursal": si esta
      // cuenta tiene una ficha de empleado con sucursal primaria fijada
      // (ver requireOperationContext, scanner/logic.ts — MISMA query: una
      // sola ficha, la más antigua), esa es la ÚNICA sucursal donde puede
      // operar de todos modos, así que preguntar es solo fricción. Dueño/
      // admin (sin ficha) o un empleado sin sucursal primaria asignada
      // siguen viendo el selector completo — nunca se deriva del claim
      // location_id del JWT (puede estar vencido hasta 1h, ver CLAUDE.md),
      // siempre de una lectura fresca contra la DB en esta misma request.
      const actor = await resolveActor(tx, session);
      const [employee] = await tx
        .select({ primaryLocationId: employees.primaryLocationId })
        .from(employees)
        .where(and(eq(employees.userId, actor.id), eq(employees.businessId, session.businessId)))
        .orderBy(asc(employees.createdAt))
        .limit(1);

      // Solo cuenta si la sucursal asignada sigue existiendo y activa entre
      // activeLocations — si se desactivó, cae al selector en vez de dejar
      // al empleado sin ninguna opción operable.
      const autoSelectedLocationId = employee?.primaryLocationId
        ? (activeLocations.find((l) => l.id === employee.primaryLocationId)?.id ?? null)
        : null;

      return { program: program ?? null, activeLocations, autoSelectedLocationId };
    },
  );

  if (!program) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader title="Scanner" />
        <Card>
          <CardContent>
            <EmptyState
              title="Configura tu programa de sellos primero"
              description="El scanner necesita un programa de lealtad activo antes de poder sellar o canjear."
              action={
                <Button asChild>
                  <Link href="/rewards">Configurar programa</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeLocations.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader title="Scanner" />
        <Card>
          <CardContent>
            <EmptyState
              title="Todavía no hay una sucursal activa"
              description="Necesitas al menos una sucursal activa para operar el scanner."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Scanner" description="Escanea, sella y canjea la tarjeta de tus clientes." />
      <ScannerClient locations={activeLocations} autoSelectedLocationId={autoSelectedLocationId} />
    </div>
  );
}
