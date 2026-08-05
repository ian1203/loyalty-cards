"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useActionToast } from "../../../lib/useActionToast";
import { createCustomerAction } from "./actions";
import type { CustomerActionState } from "./logic";

const initialState: CustomerActionState = {};

export function CreateCustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state, initialState);

  useEffect(() => {
    if (state !== initialState && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-name">Nombre</Label>
          <Input
            id="customer-name"
            name="fullName"
            maxLength={120}
            placeholder="María Pérez"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-phone">Teléfono (opcional)</Label>
          <Input
            id="customer-phone"
            name="phone"
            type="tel"
            maxLength={20}
            placeholder="+52 555 111 2233"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-email">Email (opcional)</Label>
          <Input
            id="customer-email"
            name="email"
            type="email"
            maxLength={254}
            placeholder="maria@ejemplo.com"
          />
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Dar de alta"}
        </Button>
      </div>
    </form>
  );
}
