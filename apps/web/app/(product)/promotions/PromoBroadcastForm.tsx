"use client";

import { useActionState, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { useActionToast } from "../../../lib/useActionToast";
import { sendPromoBroadcastAction } from "./actions";
import { MAX_PROMO_MESSAGE_LENGTH, type PromotionsActionState } from "./logic";

const initialState: PromotionsActionState = {};

export function PromoBroadcastForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(sendPromoBroadcastAction, initialState);
  useActionToast(state, initialState);
  // Controlado (no solo maxLength nativo): necesario para el contador en
  // vivo y la preview — no existe ningún patrón de contador en el código
  // hoy, se construye net-new.
  const [message, setMessage] = useState("");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "¿Enviar esta promoción? Llegará como notificación al Wallet de todos tus clientes y no se puede deshacer.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="promo-message">Mensaje</Label>
        <Textarea
          id="promo-message"
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MAX_PROMO_MESSAGE_LENGTH}
          placeholder="2x1 solo hoy, hasta las 8:00 p.m."
          required
          disabled={disabled || pending}
        />
        <p className="text-xs text-muted-foreground">
          {message.length}/{MAX_PROMO_MESSAGE_LENGTH} caracteres
        </p>
      </div>

      {message.trim() ? (
        <div className="rounded-md border border-dashed border-input bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">Así se verá en el pase de tus clientes</p>
          <p className="mt-1 text-sm">{message.trim()}</p>
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Enviando…" : "Enviar promoción"}
        </Button>
        {disabled ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Alcanzaste tu cupo disponible por ahora. Vuelve a intentarlo más tarde.
          </p>
        ) : null}
      </div>
    </form>
  );
}
