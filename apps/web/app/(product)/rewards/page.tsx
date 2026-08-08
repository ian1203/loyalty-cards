import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { loyaltyPrograms, rewardRules, withTenantContext } from "@loyalty/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { requireTenantSession } from "../../../lib/supabase/session";
import { ProgramForm } from "./ProgramForm";
import { NewRuleForm, RuleRow } from "./RuleForms";

// Config del programa de SELLOS + reglas de recompensa. Tenant-scoped:
// business_id sale de la sesión verificada; toda query filtra explícito por
// business_id además de RLS. staff = solo /scanner (modelo nuevo, auditoría
// RBAC) — rebotado server-side de esta página completa, ni siquiera
// lectura (antes solo tenía vista read-only, lo cual dejaba leer la config
// del negocio sin necesidad). Entre quienes SÍ llegan, owner/admin editan
// por igual — ambos son "acceso total" en el modelo nuevo.
export default async function RewardsPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "staff") {
    redirect("/scanner");
  }

  const canEdit = session.role === "owner" || session.role === "admin";

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Programa de lealtad"
        description="Sellos por visita y las recompensas que se desbloquean."
      />

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
            <EmptyState
              title="Todavía no hay un programa configurado"
              description="El dueño del negocio todavía no configuró la tarjeta de sellos."
            />
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
          ) : !canEdit || !program ? (
            <EmptyState
              title={program ? "Todavía no hay recompensas" : "Primero configura el programa de sellos"}
              description={
                program
                  ? "El dueño del negocio todavía no agregó ninguna recompensa."
                  : "Las recompensas se configuran una vez que exista un programa de sellos activo."
              }
            />
          ) : null}
          {canEdit && program ? <NewRuleForm /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
