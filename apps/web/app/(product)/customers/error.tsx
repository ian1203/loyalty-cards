"use client";

import { RouteError } from "../../../components/RouteError";

export default function CustomersError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="No se pudo cargar el directorio" reset={reset} />;
}
