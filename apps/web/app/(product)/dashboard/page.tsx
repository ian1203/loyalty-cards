import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  GiftIcon,
  ScanLineIcon,
  TrendingUpIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { businesses, withTenantContext } from "@loyalty/db";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyState } from "../../../components/EmptyState";
import { MetricCard } from "../../../components/MetricCard";
import { PageHeader } from "../../../components/PageHeader";
import { getVerifiedSession } from "../../../lib/supabase/session";
import {
  loadDashboardMetrics,
  loadNewVsReturningByWeek,
  loadRedemptionRateByWeek,
  loadVisitsByWeek,
} from "./logic";
import { NewVsReturningChart } from "./NewVsReturningChart";
import { RedemptionRateChart } from "./RedemptionRateChart";
import { VisitsChart } from "./VisitsChart";

// Overview orientado a objetivos de retención ("¿tus clientes regresan?",
// "¿estás recuperando inactivos?", "¿creces en nuevos?"), no un tablero de
// métricas crudas. Todo sale de queries tenant-scoped nuevas en logic.ts —
// mismo primitivo withTenantContext de siempre, cero tabla/columna nueva.
export default async function DashboardPage() {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }

  if (session.kind !== "tenant_user") {
    redirect("/admin");
  }

  // staff = solo /scanner (rol operativo, sin acceso al overview de negocio)
  // — real a nivel servidor, no solo oculto en el nav. Hallazgo CRÍTICO de
  // la auditoría RBAC: antes de este chequeo, cualquier staff autenticado
  // atravesaba intacto y veía métricas agregadas del negocio completo.
  if (session.role === "staff") {
    redirect("/scanner");
  }

  const { businessName, metrics, visits, newVsReturning, redemptionRate } = await withTenantContext(
    session.businessId,
    async (tx) => {
      const [business] = await tx
        .select({ name: businesses.name })
        .from(businesses)
        .where(eq(businesses.id, session.businessId));

      const metrics = await loadDashboardMetrics(tx, session.businessId);

      if (!metrics.hasProgram || !metrics.hasAnyCustomers) {
        return { businessName: business?.name ?? "tu negocio", metrics, visits: [], newVsReturning: [], redemptionRate: [] };
      }

      // Secuencial, no Promise.all: las tres comparten el mismo `tx` (una
      // transacción = una conexión de Postgres, no admite queries
      // concurrentes sobre el mismo cliente — pg lo tolera hoy encolando
      // internamente con un warning de deprecación, pero es incorrecto).
      const visits = await loadVisitsByWeek(tx, session.businessId);
      const newVsReturning = await loadNewVsReturningByWeek(tx, session.businessId);
      const redemptionRate = await loadRedemptionRateByWeek(tx, session.businessId);

      return { businessName: business?.name ?? "tu negocio", metrics, visits, newVsReturning, redemptionRate };
    },
  );

  if (!metrics.hasProgram) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={businessName} />
        <Card>
          <CardContent>
            <EmptyState
              title="Configura tu programa de sellos para empezar"
              description="En cuanto tengas un programa activo, este panel se llena solo con quién regresa, quién es nuevo y qué recompensas se están canjeando."
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

  const hasActivity = metrics.visitsThisPeriod > 0 || metrics.redemptionsThisPeriod > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={businessName} description="Cómo va tu programa de lealtad, últimos 30 días." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Clientes activos" value={metrics.activeCustomers} hint="Sellaron en 30 días" icon={<UsersIcon className="size-4" />} />
        <MetricCard label="Nuevos" value={metrics.newCustomersThisPeriod} hint="Últimos 30 días" icon={<UserPlusIcon className="size-4" />} />
        <MetricCard label="Visitas" value={metrics.visitsThisPeriod} hint="Sellos registrados" icon={<ScanLineIcon className="size-4" />} />
        <MetricCard label="Recompensas canjeadas" value={metrics.redemptionsThisPeriod} icon={<GiftIcon className="size-4" />} />
        <MetricCard
          label="Cerca de su recompensa"
          value={metrics.nearRewardCustomers}
          hint="A 1-2 sellos"
          tone="success"
          icon={<TrendingUpIcon className="size-4" />}
        />
        <MetricCard
          label="Inactivos"
          value={metrics.inactiveCustomers}
          hint="Sin visitar 60+ días"
          tone={metrics.inactiveCustomers > 0 ? "warning" : "default"}
          icon={<UserMinusIcon className="size-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Visitas por semana</CardTitle>
            <CardDescription>Sellos registrados, últimas 8 semanas.</CardDescription>
          </CardHeader>
          <CardContent>
            <VisitsChart data={visits} hasData={hasActivity} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Nuevos vs. recurrentes</CardTitle>
            <CardDescription>¿Creces con gente nueva o con quienes ya regresan?</CardDescription>
          </CardHeader>
          <CardContent>
            <NewVsReturningChart data={newVsReturning} hasData={hasActivity} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tasa de canje</CardTitle>
            <CardDescription>Porcentaje de visitas que terminaron en una recompensa canjeada.</CardDescription>
          </CardHeader>
          <CardContent>
            <RedemptionRateChart data={redemptionRate} hasData={hasActivity} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/rewards">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-base">Programa de lealtad</CardTitle>
              <CardDescription>Configura la tarjeta de sellos y sus recompensas.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/customers">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-base">Clientes</CardTitle>
              <CardDescription>Da de alta clientes y consulta su tarjeta de sellos.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/scanner">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-base">Scanner</CardTitle>
              <CardDescription>Escanea el QR del cliente para sellar o canjear.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
