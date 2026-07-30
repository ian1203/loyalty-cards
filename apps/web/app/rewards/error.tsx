"use client";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";

// Mensaje genérico a propósito: nunca detalles internos (SQL, stack traces)
// al usuario — ver frontend-conventions.
export default function RewardsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>No se pudo cargar el programa</AlertTitle>
        <AlertDescription>
          Ocurrió un error inesperado. Intenta de nuevo.
        </AlertDescription>
      </Alert>
      <div>
        <Button onClick={() => reset()}>Reintentar</Button>
      </div>
    </main>
  );
}
