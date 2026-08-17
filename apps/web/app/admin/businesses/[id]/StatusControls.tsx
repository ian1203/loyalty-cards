"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Button } from "../../../../components/ui/button";
import { setBusinessStatusAction, softDeleteBusinessAction } from "../../businesses-actions";

const STATUS_OPTIONS = [
  { value: "active" as const, label: "Activar" },
  { value: "suspended" as const, label: "Suspender" },
  { value: "unpaid" as const, label: "Marcar pago pendiente" },
];

export function StatusControls({ businessId, status }: { businessId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleStatus(next: "active" | "suspended" | "unpaid") {
    setError(null);
    startTransition(async () => {
      const result = await setBusinessStatusAction(businessId, next);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteBusinessAction(businessId);
      if (result.error) setError(result.error);
      else router.push("/admin");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.filter((option) => option.value !== status).map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => handleStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {confirmingDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            ¿Eliminar este negocio? Sus datos NO se borran, solo queda oculto del listado.
          </span>
          <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={handleDelete}>
            Confirmar eliminación
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-fit"
          onClick={() => setConfirmingDelete(true)}
        >
          Eliminar negocio
        </Button>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
