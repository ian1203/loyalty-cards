"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "../../../lib/supabase/session";
import {
  createStaffForSession,
  deactivateEmployeeForSession,
  type CreateStaffActionState,
  type TeamActionState,
} from "./logic";

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

// Mismo shim delgado — el gate de rol real vive en createStaffForSession
// (invocable directamente como endpoint, el gate en la página no basta).
export async function createStaffAction(
  _prevState: CreateStaffActionState,
  formData: FormData,
): Promise<CreateStaffActionState> {
  const session = await requireTenantSession();
  const result = await createStaffForSession(session, formData);
  if (result.success) {
    revalidatePath("/team");
  }
  return result;
}
