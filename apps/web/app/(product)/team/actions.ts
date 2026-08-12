"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "../../../lib/supabase/session";
import { deactivateEmployeeForSession, type TeamActionState } from "./logic";

// Shim delgado: resuelve la sesión desde las cookies verificadas y delega
// en logic.ts (que NO es "use server" — ver el comentario ahí).
export async function deactivateEmployeeAction(
  _prevState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const session = await requireTenantSession();
  const result = await deactivateEmployeeForSession(session, formData);
  if (result.success) {
    revalidatePath("/team");
  }
  return result;
}
