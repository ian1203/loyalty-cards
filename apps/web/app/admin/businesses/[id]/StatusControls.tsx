"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "../../../../components/ui/button";
import { setBusinessStatusAction, softDeleteBusinessAction } from "../../businesses-actions";

const STATUS_OPTIONS = [
  { value: "active" as const, label: "Activar" },
  { value: "suspended" as const, label: "Suspender" },
  { value: "unpaid" as const, label: "Marcar pago pendiente" },
];

export function StatusControls({
  businessId,
  status,
  canDelete,
}: {
  businessId: string;
  status: string;
  // Suspender/marcar pago pendiente/reactivar están abiertos a ambos roles
  // de plataforma (pedido explícito) — eliminar sigue exclusivo de owner,
  // gateado server-side en softDeleteBusiness (businesses.ts). Esta prop
  // es solo la contraparte de UI: no mostrar un botón que el servidor
  // igual va a rechazar.
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleStatus(next: "active" | "suspended" | "unpaid") {
    startTransition(async () => {
      const result = await setBusinessStatusAction(businessId, next);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Listo.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await softDeleteBusinessAction(businessId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Listo.");
        router.push("/admin");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
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
      {canDelete ? (
        confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <span className="text-sm text-muted-foreground">
              ¿Eliminar este negocio? Sus datos NO se borran, solo queda oculto del listado.
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={handleDelete}>
                Confirmar eliminación
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
            </div>
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
        )
      ) : null}
    </div>
  );
}
