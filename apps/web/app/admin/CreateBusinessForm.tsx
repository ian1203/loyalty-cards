"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useActionToast } from "../../lib/useActionToast";
import { createBusinessAction, type CreateBusinessState } from "./actions";

const initialState: CreateBusinessState = {};

// Alta completa en un solo submit: negocio + dueño (siempre) + sucursal
// inicial + color de marca + programa placeholder (los tres opcionales —
// vacíos, el negocio queda exactamente como antes de este cambio, solo
// con negocio+dueño). Antes: 2 scripts + SQL manual para lo mismo.
export function CreateBusinessForm() {
  const [state, formAction, pending] = useActionState(createBusinessAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state, initialState);

  useEffect(() => {
    if (state !== initialState && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessName">Nombre del negocio</Label>
        <Input id="businessName" name="businessName" type="text" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ownerEmail">Email del dueño</Label>
        <Input id="ownerEmail" name="ownerEmail" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="initialLocationName">Sucursal inicial (opcional)</Label>
        <Input id="initialLocationName" name="initialLocationName" type="text" placeholder="Local" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="initialStampsRequired">Sellos del programa (opcional)</Label>
        <Input
          id="initialStampsRequired"
          name="initialStampsRequired"
          type="number"
          min={1}
          placeholder="10"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brandColorHex">Color de marca (opcional)</Label>
        <Input id="brandColorHex" name="brandColorHex" type="text" placeholder="#085AB3" />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creando…" : "Crear negocio"}
      </Button>
    </form>
  );
}
