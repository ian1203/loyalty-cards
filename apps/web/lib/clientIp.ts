// Extracción de IP del cliente para superficies sin sesión (web service
// público de Apple PassKit) — única señal disponible para el rate limiter
// ahí, ver lib/rateLimit.ts. x-forwarded-for puede traer una lista
// "cliente, proxy1, proxy2"; el primer valor es el más cercano al cliente
// real en la topología de Vercel.
//
// Asume el proxy de Vercel al frente (sobrescribe/ancla este header de
// forma confiable) — sin un proxy de confianza en el camino, un cliente
// podría rotar x-forwarded-for en cada request y anular el límite. Fuera
// de Vercel, revisar esta suposición antes de confiar en el rate limit
// resultante como mitigación real de fuerza bruta.
export function resolveClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
