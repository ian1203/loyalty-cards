"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "../../../lib/supabase/session";
import { createCustomerForSession, type CustomerActionState } from "./logic";

// Shim delgado: resuelve la sesión desde las cookies verificadas y delega
// en logic.ts (que NO es "use server" — ver el comentario ahí). El gate
// completo (sesión + validación) corre en cada invocación por wire.
export async function createCustomerAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const session = await requireTenantSession();
  const result = await createCustomerForSession(session, formData);
  if (result.success) {
    revalidatePath("/customers");
  }
  return result;
}
