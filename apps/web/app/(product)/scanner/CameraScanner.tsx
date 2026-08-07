"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { CameraIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";

type Props = {
  onToken: (token: string) => void;
  disabled?: boolean;
};

// Cámara del scanner (parte de la "doble entrada" — ver
// .claude/skills/frontend-conventions/SKILL.md). Reglas de la skill
// aplicadas literalmente:
// - Permiso pedido SOLO al tocar "Escanear con cámara" (gesto del usuario),
//   nunca al montar.
// - facingMode "environment" (cámara trasera, la que apunta al QR).
// - Contexto seguro: getUserMedia exige HTTPS (localhost cuenta en dev) —
//   si el navegador no lo expone (ni siquiera mediaDevices existe), se
//   explica en vez de fallar en silencio.
// - track.stop() (vía controls.stop()) al desmontar, al detener, o tras
//   decodificar un código — no queda cámara encendida sin usarse.
export function CameraScanner({ onToken, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  async function start() {
    setError(null);

    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices) {
      setError(
        "La cámara requiere una conexión segura (HTTPS). Usa el lector USB o la búsqueda manual.",
      );
      return;
    }

    setStarting(true);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      setActive(true);
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current ?? undefined,
        (result) => {
          if (result) {
            controlsRef.current?.stop();
            controlsRef.current = null;
            setActive(false);
            onToken(result.getText());
          }
        },
      );
      controlsRef.current = controls;
    } catch (err) {
      setActive(false);
      // Distingue las dos causas más comunes (permiso vs. sin cámara) —
      // Android e iOS reportan ambas como DOMException con `name` estándar.
      // El resto de errores (cámara en uso por otra app, restricciones no
      // satisfacibles, etc.) cae al mensaje genérico — en los tres casos el
      // fallback es el mismo: lector USB / búsqueda manual, siempre visible
      // debajo, sin reintento automático en loop.
      const name = err instanceof DOMException ? err.name : null;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Permiso de cámara denegado. Revísalo en los ajustes del navegador, o usa el lector USB / búsqueda manual.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError(
          "No se encontró una cámara trasera en este dispositivo. Usa el lector USB / búsqueda manual.",
        );
      } else {
        setError(
          "No se pudo acceder a la cámara. Usa el lector USB / búsqueda manual.",
        );
      }
    } finally {
      setStarting(false);
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActive(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {active ? (
        <>
          <div className="relative w-full max-w-xs">
            <video
              ref={videoRef}
              className="aspect-square w-full rounded-md border object-cover"
              muted
              playsInline
            />
            {starting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-card/90 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-5 animate-spin" />
                Iniciando cámara…
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={stop}
            disabled={disabled}
          >
            Detener cámara
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-12 text-base"
          onClick={start}
          disabled={disabled}
        >
          <CameraIcon />
          Escanear con cámara
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
