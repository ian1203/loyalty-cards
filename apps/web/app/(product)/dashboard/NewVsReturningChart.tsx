"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NewVsReturningPoint } from "./logic";
import { EmptyState } from "../../../components/EmptyState";

function formatWeek(week: string): string {
  const d = new Date(`${week}T00:00:00Z`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
}

const SERIES_LABEL: Record<string, string> = { nuevos: "Nuevos", recurrentes: "Recurrentes" };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-token-md">
      <p className="mb-1 font-medium text-popover-foreground">{label ? formatWeek(label) : ""}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {SERIES_LABEL[entry.dataKey] ?? entry.dataKey}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function renderLegend() {
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-chart-1" />
        Nuevos
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-chart-2" />
        Recurrentes
      </span>
    </div>
  );
}

export function NewVsReturningChart({
  data,
  hasData,
}: {
  data: NewVsReturningPoint[];
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <EmptyState
        title="Todavía no hay clientes que comparar"
        description="En cuanto tengas altas y visitas repetidas, acá vas a ver quién es nuevo y quién ya regresó."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="week"
          tickFormatter={formatWeek}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Legend content={renderLegend} />
        <Bar dataKey="nuevos" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="recurrentes" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
