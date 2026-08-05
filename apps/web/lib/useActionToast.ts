"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// Reemplaza el <p role="alert">/<p className="text-muted-foreground"> que
// vivía repetido bajo cada botón de submit en cada formulario — mismo
// estado que ya devuelve useActionState, solo cambia cómo se muestra.
// `state === initial` es la comparación de referencia que useActionState
// garantiza estable hasta que la action realmente corre — así el toast
// nunca dispara en el render inicial, solo tras una respuesta real.
export function useActionToast<T extends { error?: string; success?: string }>(
  state: T,
  initial: T,
): void {
  useEffect(() => {
    if (state === initial) return;
    if (state.error) {
      toast.error(state.error);
    } else if (state.success) {
      toast.success(state.success);
    }
  }, [state, initial]);
}
