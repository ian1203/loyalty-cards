// Alta real de IRIZ STYLE contra PRODUCCIÓN — mismo patrón que
// create-chilaquikes-employees.ts: la parte de Auth (invitación real por
// email al dueño, requiere el service_role key real) corre acá con
// @supabase/supabase-js; las filas de negocio (public.businesses/users/
// audit_logs/locations) NO se insertan desde acá (no hay DATABASE_URL de
// producción legible localmente — Vercel lo marca Sensitive/write-only) —
// este script imprime el SQL idempotente exacto a correr vía
// `supabase db query --linked`, con los ids reales ya resueltos arriba.
//
// Replica EXACTAMENTE la transacción de createBusinessWithOwner
// (packages/db/src/admin.ts) + el paso previo de invite de
// apps/web/app/admin/actions.ts (createBusinessAction) — el camino
// sancionado de /admin no es alcanzable desde este entorno (sin sesión de
// navegador ni NEXT_PUBLIC_SITE_URL de prod resuelto acá), así que se
// reproduce el mismo efecto a mano en vez de inventar un mecanismo nuevo.
//
// Idempotencia: si el email del dueño ya existe en auth.users, NO se le
// genera invitación nueva (evitaría reenviar el correo y romper un link ya
// usado) — se reusa su id. El SQL impreso usa ON CONFLICT/NOT EXISTS en
// cada insert, así que correr este script dos veces no duplica nada.
//
// Uso:
//   PROD_SUPABASE_URL=... PROD_SERVICE_ROLE_KEY=... PROD_SITE_URL=... \
//   pnpm --filter web exec node --experimental-strip-types \
//   scripts/create-iriz-style-business.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.PROD_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.PROD_SERVICE_ROLE_KEY;
const SITE_URL = process.env.PROD_SITE_URL;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SITE_URL) {
  console.error("Faltan PROD_SUPABASE_URL / PROD_SERVICE_ROLE_KEY / PROD_SITE_URL en el entorno.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Admin de plataforma que figura como creador del negocio (businesses.created_by
// / audit_logs.actor_auth_user_id) — debe existir YA como fila en
// platform_admins, si no la FK del SQL de abajo falla en seco (no hay
// fallback silencioso).
const PLATFORM_ADMIN_EMAIL = "iancarlo1203@gmail.com";

const BUSINESS_NAME = "Iriz Style";
const BUSINESS_SLUG = "iriz-style"; // slugify("Iriz Style") — mismo algoritmo que apps/web/lib/slugify.ts
const OWNER_EMAIL = "iriz.pedidos@gmail.com";
const OWNER_FULL_NAME = "Sergio Cardenas";

// Decidido con el negocio antes de generar cualquier asset de Wallet: la
// paleta enviada (#d7c8f4/#a0d8d8/#f6a6a6/#b3d9ff) es toda pastel clara —
// packages/wallet/.../passGeneration.ts usa foreground/label CLAROS fijos
// (pensados para fondo oscuro), así que cualquiera de esos pasteles de
// fondo dejaría el texto del pase ilegible (pálido sobre pálido). Negro
// SÍ está en la paleta enviada y da contraste garantizado (>15:1) sin
// tocar ese código compartido con otros tenants. Los pasteles quedan
// disponibles como acento decorativo en logo/strip (imagen, no texto) el
// día que se generen los assets de Wallet — eso requiere stamps_required,
// que todavía no está definido (programa de lealtad, fuera de este alcance).
const BRAND_COLOR_HEX = "#000000";

const LOCATION_NAME = "CocoraShowroom";
const LOCATION_ADDRESS = "C. Progreso 500-int b, Col Americana, Americana, 44160 Guadalajara, Jal.";
const LOCATION_TIMEZONE = "America/Mexico_City";

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers falló: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function main() {
  const platformAdminAuthUserId = await findAuthUserIdByEmail(PLATFORM_ADMIN_EMAIL);
  if (!platformAdminAuthUserId) {
    throw new Error(
      `No se encontró ${PLATFORM_ADMIN_EMAIL} en auth.users — confirma el email del admin de plataforma.`,
    );
  }

  const existingOwner = await findAuthUserIdByEmail(OWNER_EMAIL);
  let ownerAuthUserId: string;
  let invited: boolean;
  if (existingOwner) {
    ownerAuthUserId = existingOwner;
    invited = false;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(OWNER_EMAIL, {
      redirectTo: `${SITE_URL}/set-password`,
    });
    if (error || !data.user) {
      throw new Error(`No se pudo invitar a ${OWNER_EMAIL}: ${error?.message ?? "sin usuario"}`);
    }
    ownerAuthUserId = data.user.id;
    invited = true;
  }

  const sql = `
-- === IRIZ STYLE: alta de negocio + dueño + sucursal ===
WITH new_business AS (
  INSERT INTO public.businesses (name, slug, created_by, brand_color_hex)
  VALUES ('${BUSINESS_NAME}', '${BUSINESS_SLUG}', '${platformAdminAuthUserId}', '${BRAND_COLOR_HEX}')
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
),
biz AS (
  SELECT id FROM new_business
  UNION ALL
  SELECT id FROM public.businesses
  WHERE slug = '${BUSINESS_SLUG}' AND NOT EXISTS (SELECT 1 FROM new_business)
),
owner_role AS (
  SELECT id FROM public.roles WHERE name = 'owner'
),
new_owner_user AS (
  INSERT INTO public.users (business_id, auth_user_id, email, role_id, full_name)
  SELECT biz.id, '${ownerAuthUserId}', '${OWNER_EMAIL}', owner_role.id, '${OWNER_FULL_NAME}'
  FROM biz, owner_role
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.business_id = biz.id AND u.email = '${OWNER_EMAIL}'
  )
  RETURNING id
),
new_audit AS (
  INSERT INTO public.audit_logs (business_id, actor_auth_user_id, action, entity_type, entity_id, metadata)
  SELECT biz.id, '${platformAdminAuthUserId}', 'business.created', 'business', biz.id,
    jsonb_build_object('ownerEmail', '${OWNER_EMAIL}')
  FROM biz
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_logs a WHERE a.business_id = biz.id AND a.action = 'business.created'
  )
  RETURNING id
),
new_location AS (
  INSERT INTO public.locations (business_id, name, address, timezone)
  SELECT biz.id, '${LOCATION_NAME}', '${LOCATION_ADDRESS}', '${LOCATION_TIMEZONE}'
  FROM biz
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations l WHERE l.business_id = biz.id AND l.name = '${LOCATION_NAME}'
  )
  RETURNING id
)
SELECT biz.id AS business_id FROM biz;
`;

  console.log("=== SQL a ejecutar (supabase db query --linked) ===");
  console.log(sql);
  console.log("\n=== RESULT_JSON ===");
  console.log(
    JSON.stringify({
      platformAdminAuthUserId,
      ownerAuthUserId,
      ownerEmail: OWNER_EMAIL,
      ownerInvited: invited,
      businessSlug: BUSINESS_SLUG,
    }),
  );
  console.log(
    "\nDespués de correr el SQL: guarda el business_id que devuelve el SELECT final — lo necesitas para create-iriz-style-staff.ts (Narciso) y para cualquier alta de empleados futura.",
  );
}

main().catch((error) => {
  console.error("[create-iriz-style-business] Falló:", error);
  process.exit(1);
});
