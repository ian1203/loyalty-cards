import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { locations, loyaltyPrograms, withTenantContext } from "@loyalty/db";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { requireTenantSession } from "../../../lib/supabase/session";
import { ScannerClient } from "./ScannerClient";

export default async function ScannerPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }

  const { program, activeLocations } = await withTenantContext(
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

      return { program: program ?? null, activeLocations };
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
      <ScannerClient locations={activeLocations} />
    </div>
  );
}
