import { TrendingUpIcon, UsersIcon } from "lucide-react";

// Vistazo estilizado del dashboard real (SVG/CSS, no una captura ni una UI
// falsa de "divs" pretendiendo ser una pantalla) — misma paleta de datos
// que packages/core usa en /dashboard (--chart-1/--chart-2, ver skill
// dataviz), para que quien ya use el producto reconozca la forma real de
// sus propias gráficas. Cifras de ejemplo, coherentes con el tipo de
// negocio del hero (una cafetería), no una captura de un negocio real.
export function DashboardGlance() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-token-lg">
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2.5">
        <span className="size-2 rounded-full bg-destructive/40" aria-hidden="true" />
        <span className="size-2 rounded-full bg-warning/50" aria-hidden="true" />
        <span className="size-2 rounded-full bg-success/50" aria-hidden="true" />
        <p className="ml-2 text-xs font-medium text-muted-foreground">Dashboard</p>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <UsersIcon className="size-3" aria-hidden="true" />
              Clientes activos
            </p>
            <p className="font-display text-xl font-bold leading-none">128</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TrendingUpIcon className="size-3" aria-hidden="true" />
              Visitas, esta semana
            </p>
            <p className="font-display text-xl font-bold leading-none">
              342 <span className="text-sm font-bold text-success">+18%</span>
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="mb-2 text-[11px] text-muted-foreground">Visitas por semana</p>
          <svg viewBox="0 0 220 64" className="h-16 w-full" aria-hidden="true">
            <polyline
              points="0,48 30,40 60,44 90,26 120,32 150,14 180,20 220,8"
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon
              points="0,48 30,40 60,44 90,26 120,32 150,14 180,20 220,8 220,64 0,64"
              fill="var(--chart-1)"
              opacity="0.12"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
