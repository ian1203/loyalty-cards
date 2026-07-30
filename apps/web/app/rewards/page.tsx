import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { loyaltyPrograms, rewardRules, withTenantContext } from "@loyalty/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { requireTenantSession } from "../../lib/supabase/session";
import { ProgramForm } from "./ProgramForm";
import { NewRuleForm, RuleRow } from "./RuleForms";

// Config del programa de SELLOS + reglas de recompensa. Tenant-scoped:
// business_id sale de la sesión verificada; toda query filtra explícito por
// business_id además de RLS. Solo el dueño edita — staff ve read-only y las
// actions rechazan server-side de todos modos.
export default async function RewardsPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }

  const canEdit = session.role === "owner";

  const { program, rules } = await withTenantContext(session.businessId, async (tx) => {
    const [program] = await tx
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.businessId, session.businessId))
      .orderBy(asc(loyaltyPrograms.createdAt))
      .limit(1);

    const rules = program
      ? await tx
          .select()
          .from(rewardRules)
          .where(
            and(
              eq(rewardRules.businessId, session.businessId),
              eq(rewardRules.loyaltyProgramId, program.id),
            ),
          )
          .orderBy(asc(rewardRules.createdAt))
      : [];

    return { program: program ?? null, rules };
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Programa de lealtad</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Programa de sellos</CardTitle>
          <CardDescription>
            {program
              ? "Cada visita suma un sello; al completar la tarjeta se habilita la recompensa."
              : "Todavía no hay programa. Configúralo para empezar a sellar tarjetas."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <ProgramForm program={program} />
          ) : program ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Nombre</dt>
                <dd className="font-medium">{program.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sellos para completar</dt>
                <dd className="font-medium">{program.stampsRequired}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cooldown</dt>
                <dd className="font-medium">
                  {Math.round(program.cooldownSeconds / 60)} min
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              El dueño del negocio todavía no configuró el programa.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recompensas</CardTitle>
          <CardDescription>
            {rules.length > 0
              ? "Qué se lleva el cliente y cuántos sellos necesita."
              : program
                ? "Todavía no hay recompensas. Agrega la primera."
                : "Primero configura el programa de sellos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rules.length > 0 ? (
            <div>
              {rules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} canEdit={canEdit} />
              ))}
            </div>
          ) : null}
          {canEdit && program ? <NewRuleForm /> : null}
        </CardContent>
      </Card>
    </main>
  );
}
