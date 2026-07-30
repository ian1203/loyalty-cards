import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { locations, loyaltyPrograms, withTenantContext } from "@loyalty/db";
import { requireTenantSession } from "../../lib/supabase/session";
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
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Scanner</h1>
        <p className="text-sm text-muted-foreground">
          Todavía no hay un programa de sellos configurado.{" "}
          <Link href="/rewards" className="underline">
            Configúralo en /rewards
          </Link>{" "}
          antes de usar el scanner.
        </p>
      </main>
    );
  }

  if (activeLocations.length === 0) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Scanner</h1>
        <p className="text-sm text-muted-foreground">
          Todavía no hay ninguna sucursal activa para operar el scanner.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scanner</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>
      <ScannerClient locations={activeLocations} />
    </main>
  );
}
