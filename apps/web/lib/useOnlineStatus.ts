"use client";

import { useEffect, useState } from "react";

// El MVP del scanner exige conexión real al registrar (ver skill
// frontend-conventions: sin cola offline, una operación "guardada para
// después" rompería idempotencia y cooldown server-side). Este hook es la
// señal que la UI usa para bloquear, no un mecanismo de seguridad — el
// server igual rechazaría cualquier request que sí llegara a salir.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
