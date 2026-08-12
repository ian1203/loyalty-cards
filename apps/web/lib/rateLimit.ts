// Rate limiting distribuido (Upstash Redis) para superficies sin límite
// hoy: sellado, búsqueda manual de clientes, web service de Apple. El
// limitador en memoria de scanner/logic.ts (checkLookupRateLimit) sigue
// vivo como pre-filtro de un solo proceso — este helper es el chequeo
// cross-instancia real, ver CLAUDE.md/plan de endurecimiento de seguridad.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimiterName =
  | "scanner_lookup_employee"
  | "scanner_lookup_business"
  | "scanner_stamp_employee"
  | "scanner_stamp_business"
  | "customer_search_employee"
  | "apple_webservice_ip"
  | "enroll_public_ip";

// Límites propuestos, no pedidos por número en el ticket — punto de
// partida a ajustar con tráfico real (ver plan). Dos ejes independientes
// (empleado y negocio) en scan/sellado: una key compuesta nunca detectaría
// varios empleados comprometidos del mismo negocio actuando en paralelo.
const LIMITS: Record<RateLimiterName, { windowSeconds: number; max: number }> = {
  scanner_lookup_employee: { windowSeconds: 10, max: 30 },
  scanner_lookup_business: { windowSeconds: 10, max: 90 },
  scanner_stamp_employee: { windowSeconds: 60, max: 60 },
  scanner_stamp_business: { windowSeconds: 60, max: 200 },
  customer_search_employee: { windowSeconds: 10, max: 10 },
  apple_webservice_ip: { windowSeconds: 60, max: 60 },
  // Por IP, no por empleado (ruta pública sin sesión) — 5 cada 10 min
  // alcanza para un humano llenando el form (reintentos por typo
  // incluidos) sin friccionar altas legítimas, y cierra el volumen real
  // en la enumeración por teléfono (ver EnrollDuplicatePhoneError).
  enroll_public_ip: { windowSeconds: 600, max: 5 },
};

type Logger = { warn: (...args: unknown[]) => void };
type Deps = { redis?: Redis; logger?: Logger };

// undefined = sin resolver todavía, null = confirmado no disponible.
let cachedRedis: Redis | null | undefined;
let warnedMissingConfig = false;
let warnedRuntimeError = false;
const limiters = new Map<RateLimiterName, Ratelimit>();

function resolveRedis(deps?: Deps): Redis | null {
  if (deps?.redis) return deps.redis;
  if (cachedRedis !== undefined) return cachedRedis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cachedRedis = null;
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

function getLimiter(name: RateLimiterName, redis: Redis): Ratelimit {
  let limiter = limiters.get(name);
  if (!limiter) {
    const { windowSeconds, max } = LIMITS[name];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
      prefix: `ratelimit:${name}`,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

// Fail-open uniforme (sin credenciales O si la llamada real falla): loguea
// una advertencia una sola vez por proceso y por causa, y deja pasar. Nunca
// fail-closed acá — en scanner el pre-filtro en memoria ya cubre el hueco;
// en búsqueda/Apple es un riesgo aceptado explícito (Upstash caído es un
// evento raro y transitorio, no el estado normal), documentado en el plan.
export async function checkRateLimit(
  name: RateLimiterName,
  key: string,
  deps?: Deps,
): Promise<RateLimitDecision> {
  const logger = deps?.logger ?? console;
  const redis = resolveRedis(deps);
  if (!redis) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      logger.warn(
        "[rateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN no configuradas — " +
          "rate limiting distribuido deshabilitado (fail-open). Esperado en dev/CI, nunca en producción.",
      );
    }
    return { allowed: true };
  }

  try {
    const limiter = getLimiter(name, redis);
    const result = await limiter.limit(key);
    if (result.success) {
      return { allowed: true };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch (error) {
    if (!warnedRuntimeError) {
      warnedRuntimeError = true;
      logger.warn("[rateLimit] fallo llamando a Upstash — fail-open:", error);
    }
    return { allowed: true };
  }
}

// Solo para tests: limpia el estado memoizado a nivel de módulo.
export function resetRateLimitersForTests(): void {
  cachedRedis = undefined;
  warnedMissingConfig = false;
  warnedRuntimeError = false;
  limiters.clear();
}
