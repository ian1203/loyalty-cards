"use client";

import { useActionState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { submitMarketingLeadAction } from "../actions";
import type { LeadActionState } from "../lib/leadLogic";

const initialState: LeadActionState = {};

export function LeadForm() {
  const [state, formAction, pending] = useActionState(submitMarketingLeadAction, initialState);

  if (state.success) {
    return (
      <p className="rounded-md border bg-card p-4 text-sm" role="status">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lead-contact-name">Tu nombre</Label>
          <Input id="lead-contact-name" name="contactName" maxLength={120} placeholder="María Pérez" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lead-business-name">Tu negocio</Label>
          <Input
            id="lead-business-name"
            name="businessName"
            maxLength={120}
            placeholder="Cafetería El Puerto"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lead-phone">Teléfono</Label>
          <Input id="lead-phone" name="phone" type="tel" maxLength={20} placeholder="+52 229 000 0000" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lead-email">Email (opcional)</Label>
          <Input id="lead-email" name="email" type="email" maxLength={254} placeholder="maria@ejemplo.com" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-message">Cuéntanos de tu negocio (opcional)</Label>
        <Textarea id="lead-message" name="message" maxLength={1000} placeholder="¿Cuántas sucursales tienes?" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Solicitar demo"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
