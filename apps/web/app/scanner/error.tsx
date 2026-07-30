"use client";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";

export default function ScannerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>No se pudo cargar el scanner</AlertTitle>
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
