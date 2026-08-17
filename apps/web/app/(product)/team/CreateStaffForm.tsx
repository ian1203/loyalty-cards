"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useActionToast } from "../../../lib/useActionToast";
import { createStaffAction } from "./actions";
import type { CreateStaffActionState } from "./logic";

const initialState: CreateStaffActionState = {};

type Location = { id: string; name: string };

export function CreateStaffForm({ locations }: { locations: Location[] }) {
  const [state, formAction, pending] = useActionState(createStaffAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // El panel de credenciales se puede ocultar manualmente ("Ya la copié")
  // sin esperar al siguiente submit — comparado por IDENTIDAD del objeto
  // (no un boolean) para reabrirse solo si llega un alta nueva, sin
  // depender de un efecto que reaccione a props para hacer setState (ver
  // el mismo criterio ya establecido en ScanResultBanner.tsx — evita
  // react-hooks/set-state-in-effect).
  const [dismissedCredentials, setDismissedCredentials] =
    useState<CreateStaffActionState["credentials"]>(undefined);
  useActionToast(state, initialState);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  const credentials = state.credentials === dismissedCredentials ? undefined : state.credentials;

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-name">Nombre</Label>
            <Input
              id="staff-name"
              name="fullName"
              maxLength={120}
              placeholder="Juan Pérez"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              name="email"
              type="email"
              maxLength={254}
              placeholder="juan@ejemplo.com"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-location">Sucursal (opcional)</Label>
            <select
              id="staff-location"
              name="primaryLocationId"
              defaultValue=""
              className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Cualquier sucursal</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Dar de alta"}
          </Button>
        </div>
      </form>

      {credentials ? (
        <Alert>
          <AlertTitle>Credencial generada para {credentials.fullName}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              Cópiala ahora y compártela con el empleado por un canal seguro — no se volverá a
              mostrar.
            </p>
            <div className="flex flex-col gap-1 font-mono text-sm text-foreground">
              <span>Email: {credentials.email}</span>
              <span>Contraseña: {credentials.password}</span>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDismissedCredentials(state.credentials)}
              >
                Ya la copié
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
