// Credencial TEMPORAL de rol 'admin' (acceso completo de dashboard, sin ser
// el dueño real — ver apps/web/lib/supabase/session.ts TenantRole y los
// checks `role === "owner" || role === "admin"` en rewards/promotions/team)
// para Narciso, scopeada ÚNICAMENTE a IRIZ STYLE — para QA de desarrollo.
// Mismo patrón que create-chilaquikes-employees.ts: Auth corre acá con
// @supabase/supabase-js (service_role real); las filas de negocio
// (public.users) se insertan por separado vía `supabase db query --linked`
// (no hay DATABASE_URL de producción legible localmente).
//
// *** ESTO ES TEMPORAL *** — revocar (desactivar vía /team, mismo flujo que
// offboarding real de empleados) o rotar la contraseña en cuanto termine la
// validación de QA. No es una cuenta de staff real del negocio.
//
// BUSINESS_ID: llenar con el id real que devolvió el SELECT final de
// create-iriz-style-business.ts (ejecutar ESE script primero).
//
// Uso:
//   PROD_SUPABASE_URL=... PROD_SERVICE_ROLE_KEY=... \
//   pnpm --filter web exec node --experimental-strip-types \
//   scripts/create-iriz-style-staff.ts
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.PROD_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.PROD_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan PROD_SUPABASE_URL / PROD_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUSINESS_ID = "fc2b93bb-01ca-43f9-9edf-0782abb514b4"; // IRIZ STYLE, confirmado por slug esta misma sesión
const NARCISO_EMAIL = "narciso@iriz-style.pragmia-data.com";
const NARCISO_FULL_NAME = "Narciso (QA temporal)";

// 8 caracteres, mayúscula+minúscula+dígito+símbolo garantizados. Excluye
// glifos ambiguos (I/l/1/O/0) — mismo generador que create-chilaquikes-employees.ts.
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 8) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers falló: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function main() {
  if (BUSINESS_ID.startsWith("REEMPLAZAR")) {
    throw new Error("Falta pegar el business_id real de Iriz Style (ver comentario arriba).");
  }

  const existing = await findAuthUserIdByEmail(NARCISO_EMAIL);
  let authUserId: string;
  let password: string | null;
  if (existing) {
    authUserId = existing;
    password = null;
  } else {
    password = generatePassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: NARCISO_EMAIL,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear ${NARCISO_EMAIL}: ${error?.message ?? "sin usuario"}`);
    }
    authUserId = data.user.id;
  }

  const sql = `
-- Narciso (QA temporal, rol 'admin', scopeado solo a IRIZ STYLE)
INSERT INTO public.users (business_id, auth_user_id, email, role_id, full_name)
SELECT '${BUSINESS_ID}', '${authUserId}', '${NARCISO_EMAIL}', roles.id, '${NARCISO_FULL_NAME}'
FROM public.roles WHERE roles.name = 'admin'
ON CONFLICT (business_id, email) DO NOTHING;
`;

  console.log("=== SQL a ejecutar (supabase db query --linked) ===");
  console.log(sql);
  console.log("\n=== RESULT_JSON ===");
  console.log(JSON.stringify({ email: NARCISO_EMAIL, authUserId, password }));
  console.log(
    "\nRecuerda: entrega la contraseña a Narciso por un canal seguro (no quede en un log persistente) y desactiva/rota esta cuenta en /team en cuanto termine la validación de QA.",
  );
}

main().catch((error) => {
  console.error("[create-iriz-style-staff] Falló:", error);
  process.exit(1);
});
