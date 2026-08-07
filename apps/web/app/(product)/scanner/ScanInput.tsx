"use client";

import { useEffect, useRef } from "react";
import { ScanBarcodeIcon } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

type Props = {
  onToken: (token: string) => void;
  disabled?: boolean;
};

// La otra mitad de la "doble entrada": lectores USB/bluetooth de QR son
// "keyboard wedge" — tipean el contenido como texto veloz + Enter en el
// elemento enfocado. Este input queda SIEMPRE enfocado (autofocus + re-focus
// al blur) para que el mostrador encadene escaneos sin tocar la pantalla.
// Mismo onToken que la cámara — cero lógica duplicada entre las dos vías.
// Ícono + etiqueta a propósito: sin esto, este input y el de ManualSearch
// (misma forma visual) eran indistinguibles a simple vista.
export function ScanInput({ onToken, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  function refocus() {
    // Pequeño delay: si el blur fue por un click en otro control (p.ej. el
    // botón de cámara), robarle el foco de inmediato se lo quitaría.
    window.setTimeout(() => {
      if (!disabled) inputRef.current?.focus();
    }, 50);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = event.currentTarget.value.trim();
    event.currentTarget.value = "";
    if (value) onToken(value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="scan-input" className="flex items-center gap-1.5 text-muted-foreground">
        <ScanBarcodeIcon className="size-4" />
        Lector USB / código manual
      </Label>
      <Input
        id="scan-input"
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoFocus
        disabled={disabled}
        placeholder="Escanea con el lector o tipea el código…"
        onKeyDown={handleKeyDown}
        onBlur={refocus}
        className="h-12 font-mono text-base"
      />
    </div>
  );
}
