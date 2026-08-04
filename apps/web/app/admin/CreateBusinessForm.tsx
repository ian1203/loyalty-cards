"use client";

import { useActionState } from "react";
import { createBusinessAction, type CreateBusinessState } from "./actions";

const initialState: CreateBusinessState = {};

export function CreateBusinessForm() {
  const [state, formAction, pending] = useActionState(createBusinessAction, initialState);

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="businessName">Nombre del negocio</label>
        <input id="businessName" name="businessName" type="text" required />
      </div>
      <div>
        <label htmlFor="ownerEmail">Email del dueño</label>
        <input id="ownerEmail" name="ownerEmail" type="email" required />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear negocio"}
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? (
        <p>
          Negocio &quot;{state.success.businessName}&quot; creado. Se envió invitación a{" "}
          {state.success.ownerEmail}.
        </p>
      ) : null}
    </form>
  );
}
