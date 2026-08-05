"use client";

import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

// Consolida el Alert+"Reintentar" que vivía copy-pegado, idéntico salvo el
// título, en cada error.tsx de producto. Mensaje siempre genérico — nunca
// detalles internos (SQL, stack traces) al usuario, ver frontend-conventions.
export function RouteError({ title, reset }: { title: string; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>Ocurrió un error inesperado. Intenta de nuevo.</AlertDescription>
      </Alert>
      <div>
        <Button onClick={() => reset()}>Reintentar</Button>
      </div>
    </div>
  );
}
