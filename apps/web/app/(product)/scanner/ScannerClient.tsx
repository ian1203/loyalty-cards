"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { MapPinIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { useOnlineStatus } from "../../../lib/useOnlineStatus";
import { playFeedbackTone, triggerHapticFeedback, type ScanFeedbackKind } from "../../../lib/scannerFeedback";
import { CameraScanner } from "./CameraScanner";
import { CustomerPanel } from "./CustomerPanel";
import { LocationPicker } from "./LocationPicker";
import { ManualSearch } from "./ManualSearch";
import { ScanInput } from "./ScanInput";
import { ScanResultBanner, type ScanResultKind } from "./ScanResultBanner";
import {
  lookupCustomerAction,
  lookupCustomerByIdAction,
  redeemRewardAction,
  registerStampAction,
} from "./actions";
import type { ScannerCustomerView, ScannerResult } from "./logic";

type Location = { id: string; name: string };

type ActionKind = "lookup" | "stamp" | "redeem";

type Banner = {
  kind: ScanResultKind;
  title: string;
  description?: string | null;
  autoResetMs: number | null;
};

const AUTO_RESET_MS = 3500;
const SOUND_PREF_KEY = "scanner-sound-enabled";
const SOUND_PREF_EVENT = "scanner-sound-pref-changed";

// Preferencia de sonido en localStorage vía useSyncExternalStore — mismo
// mecanismo y mismo motivo que useOnlineStatus.ts (skill
// frontend-conventions): evita el mismatch de hidratación por diseño
// (getServerSnapshot fija "true" de antemano) y no dispara el lint de
// "setState síncrono en un efecto" que sí dispara un useState+useEffect a
// mano. localStorage no tiene evento propio en la MISMA pestaña que lo
// escribe (el evento "storage" solo llega a otras pestañas) — por eso
// toggleSound() dispara un Event propio además de escribir el valor.
function subscribeSoundPref(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(SOUND_PREF_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SOUND_PREF_EVENT, callback);
  };
}

function getSoundPrefSnapshot(): boolean {
  return window.localStorage.getItem(SOUND_PREF_KEY) !== "false";
}

function getSoundPrefServerSnapshot(): boolean {
  return true;
}

// Deriva el banner grande (punto 1 de la mejora de UX del scanner) a partir
// del resultado crudo del server — la UI solo CLASIFICA visualmente lo que
// logic.ts ya decidió (cooldown, sellos insuficientes, etc.), nunca
// reinterpreta la regla de negocio. redeem se deja fuera a propósito: el
// canje sigue con su Alert chico existente hasta la siguiente iteración
// (confirmación de canje, punto 4 — explícitamente no tocado todavía).
function buildBanner(action: ActionKind, result: ScannerResult): Banner | null {
  if (result.ok) {
    if (action !== "stamp") return null;

    const availableReward = result.view.rewardOptions.find((option) => option.available);
    if (availableReward) {
      return {
        kind: "reward",
        title: "¡Recompensa disponible!",
        description: `${result.view.customer.fullName ?? "Cliente"} — ${availableReward.name}`,
        // Sin auto-reset: el panel (con el botón Canjear) debe seguir a la
        // vista hasta que el empleado actúe, no puede desaparecer solo.
        autoResetMs: null,
      };
    }

    return {
      kind: "success",
      title: `Sello registrado — ${result.view.progress.currentStamps} de ${result.view.progress.stampsRequired}`,
      description: result.view.customer.fullName ?? null,
      autoResetMs: AUTO_RESET_MS,
    };
  }

  if (action === "stamp" && result.code === "cooldown") {
    const detail = result.error.split("—")[1]?.trim();
    return {
      kind: "cooldown",
      title: "Sello reciente ya registrado",
      description: detail ?? result.error,
      autoResetMs: AUTO_RESET_MS,
    };
  }

  if (action === "lookup") {
    const notFound = /no encontrado/i.test(result.error);
    return {
      kind: "error",
      title: notFound ? "Cliente no encontrado" : "No se pudo completar",
      description: notFound ? null : result.error,
      autoResetMs: AUTO_RESET_MS,
    };
  }

  if (action === "stamp") {
    return {
      kind: "error",
      title: "No se pudo registrar el sello",
      description: result.error,
      autoResetMs: AUTO_RESET_MS,
    };
  }

  return null;
}

// Orquestador del scanner: sucursal → escaneo (cámara + USB al mismo
// onToken) → tarjeta del cliente → sellar/canjear → búsqueda manual como
// fallback. Cada botón de acción es una invocación directa de Server Action
// (no un <form>: son varias acciones con argumentos propios, no un solo
// submit) — el gate de sesión/rol/estado vive en la Server Action, esto
// solo maneja estado de UI.
//
// autoSelectedLocationId (page.tsx la resuelve fresca contra la DB, nunca
// del JWT — ver el comentario ahí) salta el paso de LocationPicker para un
// empleado con exactamente una sucursal asignada: SOLO fija el estado
// inicial de este componente, es cortesía de UI, no seguridad — cada
// sello/canje sigue re-validando la sucursal server-side en
// requireOperationContext exactamente igual que si el operador la hubiera
// elegido a mano.
export function ScannerClient({
  locations,
  autoSelectedLocationId,
}: {
  locations: Location[];
  autoSelectedLocationId: string | null;
}) {
  const online = useOnlineStatus();
  const [locationId, setLocationId] = useState<string | null>(autoSelectedLocationId);
  const [view, setView] = useState<ScannerCustomerView | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  // Fuerza un remount de <ScanResultBanner> por cada resultado nuevo (ver
  // el comentario en ese archivo) — así su countdown se reinicia por key,
  // nunca por un efecto reaccionando a props.
  const [resultId, setResultId] = useState(0);
  const [pending, startTransition] = useTransition();
  const soundEnabled = useSyncExternalStore(
    subscribeSoundPref,
    getSoundPrefSnapshot,
    getSoundPrefServerSnapshot,
  );

  function toggleSound() {
    window.localStorage.setItem(SOUND_PREF_KEY, String(!soundEnabled));
    window.dispatchEvent(new Event(SOUND_PREF_EVENT));
  }

  function fireFeedback(kind: ScanFeedbackKind) {
    triggerHapticFeedback(kind);
    if (soundEnabled) playFeedbackTone(kind);
  }

  function applyResult(action: ActionKind, result: ScannerResult) {
    const nextBanner = buildBanner(action, result);
    setBanner(nextBanner);
    setResultId((id) => id + 1);
    if (nextBanner) fireFeedback(nextBanner.kind);

    if (result.ok) {
      setView(result.view);
      setMessage(action === "redeem" ? (result.message ?? null) : null);
      // Se regenera SOLO tras una respuesta ok (éxito o replay confirmado):
      // ante un rechazo de regla de negocio (cooldown, sellos insuficientes)
      // no se creó ninguna fila con esta key, así que reintentar con la
      // MISMA key sigue siendo seguro — y es lo correcto si el rechazo real
      // fue, por ejemplo, un corte de red antes de recibir la respuesta.
      setIdempotencyKey(crypto.randomUUID());
    } else {
      setMessage(null);
      // Solo lookup limpia el panel — un error al sellar/canjear no debe
      // hacer desaparecer al cliente que sigue frente al mostrador.
      if (action === "lookup") setView(null);
    }
  }

  function resetToScan() {
    setView(null);
    setBanner(null);
    setMessage(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  // Una Server Action puede LANZAR en vez de devolver {ok:false} — el caso
  // real encontrado en producción es "Failed to find Server Action" (el
  // navegador sigue con el bundle de un deploy viejo mientras el servidor
  // ya sirve uno nuevo: el id de la action ya no existe del lado del
  // servidor). Sin este catch, la excepción no llegaba a applyResult() —
  // subía sin capturar y el error boundary de la ruta (error.tsx, "No se
  // pudo cargar el scanner") se quedaba pegado hasta que el empleado
  // recargara a mano. Mismo tratamiento para cualquier otra excepción real
  // (corte de red a medio request): recargar es lo único que reconecta el
  // bundle del cliente con lo que el servidor espera.
  function handleActionError() {
    setBanner({
      kind: "error",
      title: "La app se actualizó",
      description: "Recargando para seguir escaneando…",
      autoResetMs: null,
    });
    setResultId((id) => id + 1);
    window.setTimeout(() => window.location.reload(), 1200);
  }

  function handleToken(token: string) {
    setBanner(null);
    startTransition(async () => {
      try {
        const result = await lookupCustomerAction(token);
        applyResult("lookup", result);
      } catch {
        handleActionError();
      }
    });
  }

  function handleManualSelect(customerId: string) {
    setBanner(null);
    startTransition(async () => {
      try {
        const result = await lookupCustomerByIdAction(customerId);
        applyResult("lookup", result);
      } catch {
        handleActionError();
      }
    });
  }

  function handleStamp() {
    if (!view || !locationId) return;
    setBanner(null);
    startTransition(async () => {
      try {
        const result = await registerStampAction({
          customerId: view.customer.id,
          locationId,
          idempotencyKey,
        });
        applyResult("stamp", result);
      } catch {
        handleActionError();
      }
    });
  }

  function handleRedeem(ruleId: string) {
    if (!view || !locationId) return;
    setBanner(null);
    startTransition(async () => {
      try {
        const result = await redeemRewardAction({
          customerId: view.customer.id,
          ruleId,
          locationId,
          idempotencyKey,
        });
        applyResult("redeem", result);
      } catch {
        handleActionError();
      }
    });
  }

  // Aviso, no bloqueo: navigator.onLine es notoriamente poco confiable en
  // Safari/Chrome de iOS (WebKit) — reporta "false" con conexión real,
  // especialmente cambiando de red. Un bloqueo total sobre esa señal dejaba
  // el scanner completo inoperable (ni cámara ni búsqueda manual) en un
  // dispositivo con internet de verdad — bug real encontrado en producción.
  // La seguridad de fondo no depende de esto: si de verdad no hay red, la
  // Server Action de sellar/canjear falla y el error normal de
  // applyResult() ya lo comunica — no hay cola offline que "sincronice
  // después" (ver skill frontend-conventions), pero tampoco hace falta
  // adivinar la conectividad del lado del cliente para eso.
  const offlineWarning = !online ? (
    <Alert variant="destructive">
      <AlertTitle>Podrías estar sin conexión</AlertTitle>
      <AlertDescription>
        Tu navegador reporta que no hay internet — puede ser un falso
        positivo. Si un sello o canje no se registra, revisa tu conexión e
        intenta de nuevo.
      </AlertDescription>
    </Alert>
  ) : null;

  if (!locationId) {
    return (
      <div className="flex flex-col gap-4">
        {offlineWarning}
        <LocationPicker locations={locations} onSelect={setLocationId} />
      </div>
    );
  }

  // Confirmación visual de dónde queda cada sello/canje — sobre todo para
  // el caso de auto-selección (el empleado nunca la eligió a mano), pero se
  // muestra siempre que hay una sucursal activa, elegida o asignada.
  const activeLocationName = locations.find((l) => l.id === locationId)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      {offlineWarning}
      <div className="flex items-center justify-between gap-3">
        {activeLocationName ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <MapPinIcon className="size-4 shrink-0" />
            Sellando en: <span className="text-foreground">{activeLocationName}</span>
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleSound}
          aria-pressed={soundEnabled}
          className="text-muted-foreground"
        >
          {soundEnabled ? <Volume2Icon className="size-4" /> : <VolumeXIcon className="size-4" />}
          {soundEnabled ? "Sonido activado" : "Sonido silenciado"}
        </Button>
      </div>

      {banner ? (
        <ScanResultBanner
          key={resultId}
          kind={banner.kind}
          title={banner.title}
          description={banner.description}
          autoResetMs={banner.autoResetMs}
          onReset={resetToScan}
        />
      ) : null}

      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {view ? (
        <CustomerPanel
          view={view}
          onStamp={handleStamp}
          onRedeem={handleRedeem}
          onClear={resetToScan}
          pending={pending}
        />
      ) : banner ? null : (
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
