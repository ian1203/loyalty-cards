// Invita dos cuentas reales de plataforma vía Auth Admin API — la clave
// nunca se guarda en el repo, se lee de env en el momento de correr (mismo
// patrón que create-iriz-style-staff.ts).
//
// Uso:
//   PROD_SUPABASE_URL=... PROD_SERVICE_ROLE_KEY=... \
//   pnpm --filter web exec node --experimental-strip-types \
//   scripts/invite-platform-accounts.ts
//
// (1) gaburto1108@icloud.com — cuenta NUEVA (el socio), invitada por email
//     (inviteUserByEmail), redirige a /set-password para elegir contraseña.
//     El alta en platform_admins (platform_role='viewer') se hace APARTE
//     vía `supabase db query --linked` (no hay DATABASE_URL de prod legible
//     localmente — mismo patrón que create-iriz-style-business.ts): este
//     script imprime el SQL exacto con el auth_user_id real al terminar,
//     no lo ejecuta él mismo.
// (2) iancarlo1203@gmail.com — cuenta YA EXISTENTE (platform owner activo).
//     resetPasswordForEmail en vez de inviteUserByEmail (esa es solo para
//     cuentas nuevas sin confirmar) — mismo redirect a /set-password, que
//     ya maneja genéricamente cualquier fragmento #access_token de tipo
//     invite O recovery (ver set-password/page.tsx: setSession() +
//     updateUser({password}) sin distinguir el tipo de link).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.PROD_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.PROD_SERVICE_ROLE_KEY;
const SITE_URL = process.env.PROD_SITE_URL ?? "https://www.pragmia-data.com";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan PROD_SUPABASE_URL / PROD_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PARTNER_EMAIL = "gaburto1108@icloud.com";
const OWNER_EMAIL = "iancarlo1203@gmail.com";

// Hallazgo real de una revisión ofensiva: invitar por error el email de un
// dueño/staff real de un negocio como admin de plataforma le da
// is_platform_admin=true en su próximo login — getVerifiedSession() corta
// ahí primero, así que esa persona pierde silenciosamente su acceso normal
// de tenant (mismo bug ya corregido a mano para iancarlo1203@gmail.com en
// Chilaquikes esta sesión). Se consulta vía PostgREST con la clave de
// servicio (bypassa RLS, igual que adminDb) — este script no tiene
// DATABASE_URL de prod, pero sí puede leer `public.users` así.
async function assertNotExistingTenantUser(email: string): Promise<void> {
  const { data, error } = await admin.from("users").select("business_id").eq("email", email).limit(1);
  if (error) {
    throw new Error(`No se pudo verificar si ${email} ya es un usuario de tenant: ${error.message}`);
  }
  if (data && data.length > 0) {
    throw new Error(
      `${email} ya es dueño/staff de un negocio (business_id ${data[0].business_id}) — invitarlo como admin de plataforma le quitaría su acceso normal de tenant en su próximo login. Desactiva esa membresía primero si esto es intencional.`,
    );
  }
}

async function main() {
  await assertNotExistingTenantUser(PARTNER_EMAIL);

  const invite = await admin.auth.admin.inviteUserByEmail(PARTNER_EMAIL, {
    redirectTo: `${SITE_URL}/set-password`,
  });
  if (invite.error || !invite.data.user) {
    throw new Error(`No se pudo invitar a ${PARTNER_EMAIL}: ${invite.error?.message ?? "error desconocido"}`);
  }
  console.log(`Invitación enviada a ${PARTNER_EMAIL} — auth_user_id: ${invite.data.user.id}`);
  console.log("\nSQL a correr con `supabase db query --linked` para darle el rol platform viewer:\n");
  console.log(
    `insert into public.platform_admins (auth_user_id, platform_role, is_active) values ('${invite.data.user.id}', 'viewer', true) on conflict (auth_user_id) do update set platform_role='viewer', is_active=true;\n`,
  );

  const reset = await admin.auth.resetPasswordForEmail(OWNER_EMAIL, {
    redirectTo: `${SITE_URL}/set-password`,
  });
  if (reset.error) {
    throw new Error(`No se pudo enviar el link de recuperación a ${OWNER_EMAIL}: ${reset.error.message}`);
  }
  console.log(`Link de recuperación de contraseña enviado a ${OWNER_EMAIL}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
