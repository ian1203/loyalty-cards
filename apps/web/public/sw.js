// Service worker MÍNIMO — solo instalabilidad, SIN cola offline (ver
// .claude/skills/frontend-conventions/SKILL.md: el MVP exige conexión real
// al registrar sellos/canjes; una operación "guardada para después" rompe
// la idempotencia y el cooldown server-side).
//
// CRÍTICO, corregido tras revisión de seguridad: NUNCA cachear /scanner (ni
// ninguna otra página). /scanner es HTML server-renderizado CON DATOS DEL
// TENANT (nombres de sucursales, nombre del programa — ver
// app/scanner/page.tsx). Cachearla con cache-first, sin invalidación ligada
// a la sesión, filtraría esos datos si el mismo dispositivo/navegador se
// reutiliza después para OTRO negocio (tablet de mostrador reasignada,
// perfil de navegador compartido) — la respuesta cacheada del negocio
// anterior se serviría sin pasar por sesión/RLS.
//
// Solo se cachean los DOS íconos: son estáticos, idénticos para cualquier
// negocio, nunca contienen datos de tenant. Un service worker registrado
// con un fetch handler (aunque cachee poco) ya satisface el criterio de
// instalabilidad del navegador — no hace falta cachear HTML para eso.
// v3: contenido de los íconos cambió (rebrand Pragmia) — el nombre de
// archivo es el mismo, así que sin bump de versión un SW ya instalado
// seguiría sirviendo el ícono viejo cacheado indefinidamente.
const CACHE_NAME = "loyalty-scanner-shell-v3";
const STATIC_ASSET_URLS = ["/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSET_URLS))
      .catch(() => {
        // Si el precache falla (p.ej. offline durante la instalación), no
        // bloquea la instalación del SW — solo no queda nada cacheado.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Solo intercepta GETs de los dos íconos estáticos. Cualquier otra
  // request — TODA página (incluida /scanner), Server Actions, todo POST —
  // pasa de largo sin tocar el service worker: nunca se cachea, nunca se
  // sirve stale, nunca se encola offline.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!STATIC_ASSET_URLS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});
