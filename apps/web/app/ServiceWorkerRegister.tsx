"use client";

import { useEffect } from "react";

// Registra el service worker mínimo (public/sw.js). Sin efecto visible —
// solo habilita instalabilidad; ver el SW para la política de cache (solo
// shell estático, sin cola offline).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No hay nada accionable para el usuario si el registro falla (p.ej.
      // contexto no seguro) — la app sigue funcionando sin PWA.
    });
  }, []);

  return null;
}
