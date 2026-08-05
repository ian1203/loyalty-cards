"use client";

import { useSyncExternalStore } from "react";

// El MVP del scanner exige conexión real al registrar (ver skill
// frontend-conventions: sin cola offline, una operación "guardada para
// después" rompería idempotencia y cooldown server-side). Este hook es la
// señal que la UI usa para bloquear, no un mecanismo de seguridad — el
// server igual rechazaría cualquier request que sí llegara a salir.
//
// useSyncExternalStore es el mecanismo correcto de React para esto —
// exactamente "suscribirse a una fuente externa mutable" (evento
// online/offline del navegador) — en vez de useState+useEffect a mano:
// evita el mismatch de hidratación por diseño (getServerSnapshot fija el
// valor del server explícitamente, en vez de que un efecto lo corrija
// después) y no dispara el lint de "setState síncrono en un efecto".
function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // El server no tiene navigator — "online" es el único valor consistente
  // que se puede afirmar de antemano; se corrige solo en el cliente en
  // cuanto useSyncExternalStore lee el snapshot real.
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
