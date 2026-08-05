"use client";

import { RouteError } from "../../../components/RouteError";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="No se pudo cargar el dashboard" reset={reset} />;
}
