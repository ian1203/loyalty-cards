import { redirect } from "next/navigation";
import { and, count, eq, gte } from "drizzle-orm";
import { businesses, promoBroadcasts, withTenantContext } from "@loyalty/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { requireTenantSession } from "../../../lib/supabase/session";
import { PromoBroadcastForm } from "./PromoBroadcastForm";
import { DAILY_LIMIT, MONTHLY_LIMIT_BY_PLAN, startOfMonthUtc, startOfTodayUtc } from "./logic";

// Broadcast de promociones a Wallet: SOLO dueño/admin (mismo gate que
// /rewards y /team) — staff rebotado server-side de la página completa,
// ni siquiera lectura. Gate de plan real vive en logic.ts (server action);
// acá solo se lee para mostrar el estado y el cupo restante.
export default async function PromotionsPage() {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "staff") {
    redirect("/scanner");
  }

  const now = new Date();

  const { plan, sentToday, sentThisMonth } = await withTenantContext(session.businessId, async (tx) => {
    const [business] = await tx
      .select({ plan: businesses.plan })
      .from(businesses)
      .where(eq(businesses.id, session.businessId))
      .limit(1);

    const [todayCount] = await tx
      .select({ value: count() })
      .from(promoBroadcasts)
      .where(
        and(
          eq(promoBroadcasts.businessId, session.businessId),
          gte(promoBroadcasts.createdAt, startOfTodayUtc(now)),
        ),
      );
    const [monthCount] = await tx
      .select({ value: count() })
      .from(promoBroadcasts)
      .where(
        and(
          eq(promoBroadcasts.businessId, session.businessId),
          gte(promoBroadcasts.createdAt, startOfMonthUtc(now)),
        ),
      );

    return {
      plan: business?.plan ?? "basico",
      sentToday: todayCount?.value ?? 0,
      sentThisMonth: monthCount?.value ?? 0,
    };
  });

  const isEligible = plan === "negocio" || plan === "intelligence";
  const monthlyLimit = isEligible ? MONTHLY_LIMIT_BY_PLAN[plan] : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Promociones"
        description="Envía un mensaje que llega como notificación al Wallet de todos tus clientes, sin importar su ubicación."
      />

      <Card>
        <CardHeader>
          <CardTitle>Nueva promoción</CardTitle>
          <CardDescription>
            {isEligible
              ? `Cupo de tu plan: ${sentThisMonth}/${monthlyLimit} este mes, ${sentToday}/${DAILY_LIMIT} hoy.`
              : "Esta función está disponible en los planes Negocio e Intelligence."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEligible ? (
            <PromoBroadcastForm
              disabled={sentToday >= DAILY_LIMIT || sentThisMonth >= monthlyLimit}
            />
          ) : (
            <EmptyState
              title="No disponible en tu plan"
              description="Contacta a Pragmia para actualizar tu plan y desbloquear el envío de promociones."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
