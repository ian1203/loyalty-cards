"use client";

import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { createCustomerAction } from "./actions";
import type { CustomerActionState } from "./logic";

const initialState: CustomerActionState = {};

export function CreateCustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Dar de alta"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-muted-foreground">{state.success}</p>
        ) : null}
      </div>
    </form>
  );
}
