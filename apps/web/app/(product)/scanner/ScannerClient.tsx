"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { useOnlineStatus } from "../../../lib/useOnlineStatus";
import { CameraScanner } from "./CameraScanner";
import { CustomerPanel } from "./CustomerPanel";
import { LocationPicker } from "./LocationPicker";
import { ManualSearch } from "./ManualSearch";
import { ScanInput } from "./ScanInput";
import {
  lookupCustomerAction,
  lookupCustomerByIdAction,
  redeemRewardAction,
  registerStampAction,
} from "./actions";
import type { ScannerCustomerView, ScannerResult } from "./logic";

type Location = { id: string; name: string };

// Orquestador del scanner: sucursal → escaneo (cámara + USB al mismo
// onToken) → tarjeta del cliente → sellar/canjear → búsqueda manual como
// fallback. Cada botón de acción es una invocación directa de Server Action
// (no un <form>: son varias acciones con argumentos propios, no un solo
// submit) — el gate de sesión/rol/estado vive en la Server Action, esto
// solo maneja estado de UI.
export function ScannerClient({ locations }: { locations: Location[] }) {
  const online = useOnlineStatus();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [view, setView] = useState<ScannerCustomerView | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyResult(result: ScannerResult) {
    if (result.ok) {
      setView(result.view);
      setError(null);
      setMessage(result.message ?? null);
      // Se regenera SOLO tras una respuesta ok (éxito o replay confirmado):
      // ante un rechazo de regla de negocio (cooldown, sellos insuficientes)
      // no se creó ninguna fila con esta key, así que reintentar con la
      // MISMA key sigue siendo seguro — y es lo correcto si el rechazo real
      // fue, por ejemplo, un corte de red antes de recibir la respuesta.
      setIdempotencyKey(crypto.randomUUID());
    } else {
      setError(result.error);
      setMessage(null);
    }
  }

  function handleToken(token: string) {
    setError(null);
    startTransition(async () => {
      const result = await lookupCustomerAction(token);
      applyResult(result);
    });
  }

  function handleManualSelect(customerId: string) {
    setError(null);
    startTransition(async () => {
      const result = await lookupCustomerByIdAction(customerId);
      applyResult(result);
    });
  }

  function handleStamp() {
    if (!view || !locationId) return;
    setError(null);
    startTransition(async () => {
      const result = await registerStampAction({
        customerId: view.customer.id,
        locationId,
        idempotencyKey,
      });
      applyResult(result);
    });
  }

  function handleRedeem(ruleId: string) {
    if (!view || !locationId) return;
    setError(null);
    startTransition(async () => {
      const result = await redeemRewardAction({
        customerId: view.customer.id,
        ruleId,
        locationId,
        idempotencyKey,
      });
      applyResult(result);
    });
  }

  function handleClear() {
    setView(null);
    setError(null);
    setMessage(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  if (!online) {
    // Bloqueo total, no solo deshabilitar botones: el MVP exige conexión
    // real al registrar — no hay cola offline que "sincronice después" (ver
    // skill frontend-conventions). Ningún panel interactivo se renderiza.
    return (
      <Alert variant="destructive">
        <AlertTitle>Sin conexión</AlertTitle>
        <AlertDescription>
          El scanner necesita internet para operar — los sellos y canjes se
          validan en el momento. Reconéctate para continuar.
        </AlertDescription>
      </Alert>
    );
  }

  if (!locationId) {
    return <LocationPicker locations={locations} onSelect={setLocationId} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo completar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message && !error ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {view ? (
        <CustomerPanel
          view={view}
          onStamp={handleStamp}
          onRedeem={handleRedeem}
          onClear={handleClear}
          pending={pending}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <ScanInput onToken={handleToken} disabled={pending} />
          <CameraScanner onToken={handleToken} disabled={pending} />
          <div className="border-t pt-4">
            <ManualSearch onSelect={handleManualSelect} disabled={pending} />
          </div>
        </div>
      )}
    </div>
  );
}
