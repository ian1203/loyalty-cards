// Alta de las 3 cuentas de empleado de CHILAQUIKES (una por sucursal),
// rol 'staff' (solo /scanner — ver AppShell.tsx navItemsForRole y el RBAC
// ya auditado), cada una scopeada a su employees.primary_location_id +
// businesses.id real. Script de un solo uso, ejecutado a mano contra
// PRODUCCIÓN — mismo patrón que
// packages/wallet/scripts/migrate-google-class-v2.ts: la parte de Auth
// (auth.admin.createUser, requiere el service_role key real) corre acá con
// @supabase/supabase-js; las filas de negocio (public.users/employees) se
// insertan por separado vía `supabase db query --linked` (no hay
// DATABASE_URL de producción legible localmente — Vercel lo marca
// Sensitive/write-only), imprimiendo el SQL idempotente a ejecutar.
//
// Login es por EMAIL (ver apps/web/tests/support/testAuth.ts,
// signInWithPassword({email, password}) — mismo mecanismo que usa
// /login real), no por username. Identificador: <sucursal>@chilaquikes.
// pragmia-data.com, consistente con el dominio real de contacto de
// Pragmia (admin@pragmia-data.com, ver CLAUDE.md).
//
// Idempotencia: si un email ya existe en auth.users, NO se le genera
// contraseña nueva (evitaría romper el acceso de alguien que ya la está
// usando) — se reusa su id y se imprime "ya existía" en vez de una
// contraseña.
//
// Uso: PROD_SUPABASE_URL=... PROD_SERVICE_ROLE_KEY=... \
//   pnpm --filter web exec node --experimental-strip-types \
//   scripts/create-chilaquikes-employees.ts
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

const BUSINESS_ID = "26166780-c160-4e91-81a5-a0694a96cecc"; // CHILAQUIKES, confirmado por slug esta misma sesión
const EMAIL_DOMAIN = "chilaquikes.pragmia-data.com";

const EMPLOYEES = [
  {
    key: "colon",
    email: `colon@${EMAIL_DOMAIN}`,
    fullName: "Empleado Local Colón",
    sucursal: "Local — Av. Cristóbal Colón casi esq. Boulevard #43",
    locationId: "4f8f0146-2e77-475a-82ad-55b4c611a6ca",
  },
  {
    key: "torrente",
    email: `torrente@${EMAIL_DOMAIN}`,
    fullName: "Empleado Foodtruck Torrente",
    sucursal: "Foodtruck — Campus Torrente UCC",
    locationId: "bb382fab-5960-4fbe-b5fc-ce424d254809",
  },
  {
    key: "calasanz",
    email: `calasanz@${EMAIL_DOMAIN}`,
    fullName: "Empleado Foodtruck Calasanz",
    sucursal: "Foodtruck — Campus Calasanz UCC",
    locationId: "cba3dd94-c537-4e69-a573-2a0817a4e183",
  },
] as const;

// 8 caracteres, mayúscula+minúscula+dígito+símbolo garantizados. Excluye
// glifos ambiguos (I/l/1/O/0) para que Narciso los pueda transcribir a
// mano sin error al repartirlos.
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

type Result = {
  key: string;
  email: string;
  fullName: string;
  sucursal: string;
  locationId: string;
  authUserId: string;
  password: string | null; // null = ya existía, no se tocó su contraseña
};

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  // Universo de auth.users en este proyecto es chico (dueños + admins de
  // plataforma + staff) — una sola página alcanza de sobra.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers falló: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureAuthUser(email: string): Promise<{ authUserId: string; password: string | null }> {
  const existing = await findAuthUserIdByEmail(email);
  if (existing) {
    return { authUserId: existing, password: null };
  }
  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`No se pudo crear ${email}: ${error?.message ?? "sin usuario"}`);
  }
  return { authUserId: data.user.id, password };
}

async function main() {
  const results: Result[] = [];
  for (const emp of EMPLOYEES) {
    const { authUserId, password } = await ensureAuthUser(emp.email);
    results.push({ ...emp, authUserId, password });
  }

  // No se escribe public.users/employees desde acá (sin DATABASE_URL de
  // producción localmente) — se imprime el SQL idempotente exacto para
  // correr vía `supabase db query --linked`, con los authUserId reales ya
  // resueltos arriba.
  const sqlStatements = results
    .map(
      (r) => `
-- ${r.sucursal} (${r.email})
INSERT INTO public.users (business_id, auth_user_id, email, role_id, full_name)
SELECT '${BUSINESS_ID}', '${r.authUserId}', '${r.email}', roles.id, '${r.fullName}'
FROM roles WHERE roles.name = 'staff'
ON CONFLICT (business_id, email) DO NOTHING;

INSERT INTO public.employees (business_id, user_id, primary_location_id, full_name, is_active)
SELECT '${BUSINESS_ID}', u.id, '${r.locationId}', '${r.fullName}', true
FROM public.users u
WHERE u.business_id = '${BUSINESS_ID}' AND u.auth_user_id = '${r.authUserId}'
  AND NOT EXISTS (
    SELECT 1 FROM public.employees e WHERE e.business_id = '${BUSINESS_ID}' AND e.user_id = u.id
  );`,
    )
    .join("\n");

  console.log("=== SQL a ejecutar (supabase db query --linked) ===");
  console.log(sqlStatements);
  console.log("\n=== RESULT_JSON ===");
  console.log(JSON.stringify(results));
}

main().catch((error) => {
  console.error("[create-chilaquikes-employees] Falló:", error);
  process.exit(1);
});
