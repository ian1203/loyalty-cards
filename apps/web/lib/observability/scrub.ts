// Defensa en profundidad para el filtro de PII/secretos hacia Sentry — ver
// captureServerError.ts para la disciplina de PRIMERA línea (los call sites
// solo pueden pasar primitivos explícitos, nunca un objeto de cliente/
// formData completo). Esto es la red de seguridad SEGUNDA línea: si algún
// integration por default de Sentry (breadcrumbs de fetch/http, contexto de
// request) llegara a adjuntar algo con estas keys, se elimina antes de salir
// de la app — nunca confiamos en que la primera línea sea infalible.
//
// Denylist basada en los campos que este proyecto trata como sensibles (ver
// CLAUDE.md, Reglas NO negociables): el token opaco del QR/Wallet, PII de
// cliente (nombre, teléfono, email, cumpleaños, ocupación, dirección de
// envío), y cualquier secreto/credencial.
const SENSITIVE_KEY_PATTERN =
  /token|password|contrase|secret|authorization|cookie|apikey|api_key|service_role|private_key|cert|dsn|phone|telefono|email|correo|fullname|full_name|firstname|first_name|lastname|last_name|dateofbirth|date_of_birth|dob|occupation|ocupacion|shippingaddress|shipping_address|address|direccion/i;

const MAX_DEPTH = 6;

// Segunda capa DENTRO de la segunda línea: Postgres a veces embebe el valor
// real de una columna en el mensaje de error de una violación de
// constraint (p.ej. `Key (phone)=(5551234567) already exists`) — eso no es
// una key sospechosa, es TEXTO LIBRE dentro de `error.message`/
// `exception.values[].value`, así que el filtro por key de arriba no lo
// toca. Se escanea CUALQUIER string del evento (no solo bajo keys
// sensibles) por patrones de email/teléfono y se redacta el match, sin
// descartar el resto del mensaje — la parte de diagnóstico ("violación de
// constraint único en customers") sigue siendo útil.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const LONG_DIGIT_RUN_PATTERN = /\b\d{10,}\b/g;

function scrubText(text: string): string {
  return text.replace(EMAIL_PATTERN, "[EMAIL]").replace(LONG_DIGIT_RUN_PATTERN, "[DIGITS]");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[Truncated]";
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[Filtered]" : scrubValue(val, depth + 1);
    }
    return result;
  }
  return value;
}

// Recibe un evento o breadcrumb de Sentry (ambos son objetos JSON-ables) y
// devuelve una copia con cualquier key sensible reemplazada por
// "[Filtered]" — nunca elimina el evento completo, solo el campo sospechoso,
// para no perder la señal de diagnóstico por un falso positivo del patrón.
export function scrubSensitiveData<T extends Record<string, unknown>>(input: T): T {
  return scrubValue(input, 0) as T;
}
