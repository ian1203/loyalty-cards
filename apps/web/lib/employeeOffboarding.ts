// Único archivo fuera de /admin autorizado a llamar createAdminClient()
// (Supabase Auth Admin API — superficie distinta de adminDb/Postgres, pero
// el mismo espíritu de la regla "cero adminDb fuera de /admin" de
// CLAUDE.md aplica). Excepción angosta y nombrada, mismo criterio que los
// otros dos precedentes ya documentados en este repo (passAuth.ts,
// listUpdatedSerialsForDevice): un helper chico, con un solo propósito,
// verificado por apps/web/tests/prod-readiness.test.ts.
//
// Bloquea el login/refresh futuro de un empleado desactivado — NO revoca
// un access token ya emitido y aún vigente (imposible con verificación
// stateless de JWT, ver CLAUDE.md). team/logic.ts ya desactivó al empleado
// en DB antes de llamar esto; esta llamada es best-effort, nunca bloqueante.
import { createAdminClient } from "./supabase/server";

// ~100 años — el string más largo que Supabase Auth acepta como "ban_duration"
// efectivamente permanente. No existe un sentinel "forever" real.
const PERMANENT_BAN_DURATION = "876000h";

export async function banEmployeeAuth(authUserId: string): Promise<{ ok: boolean }> {
  const { error } = await createAdminClient().auth.admin.updateUserById(authUserId, {
    ban_duration: PERMANENT_BAN_DURATION,
  });
  return { ok: !error };
}
