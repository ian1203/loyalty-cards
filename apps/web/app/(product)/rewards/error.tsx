"use client";

import { RouteError } from "../../../components/RouteError";

export default function RewardsError({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="No se pudo cargar el programa" reset={reset} />;
}
