"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "../../../lib/supabase/session";
import { sendPromoBroadcastForSession, type PromotionsActionState } from "./logic";

// Shim delgado: resuelve la sesión desde cookies verificadas y delega en
// logic.ts (que NO es "use server" — ver el comentario ahí). Mismo patrón
// que rewards/actions.ts y team/actions.ts.
export async function sendPromoBroadcastAction(
  _prevState: PromotionsActionState,
  formData: FormData,
): Promise<PromotionsActionState> {
  const session = await requireTenantSession();
  const result = await sendPromoBroadcastForSession(session, formData);
  if (result.success) {
    revalidatePath("/promotions");
  }
  return result;
}
