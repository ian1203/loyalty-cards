"use client";

import { RouteError } from "../../../components/RouteError";

export default function ScannerError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="No se pudo cargar el scanner" reset={reset} />;
}
