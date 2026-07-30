"use server";

import { revalidatePath } from "next/cache";
import { requireTenantSession } from "../../lib/supabase/session";
import {
  saveProgramForSession,
  saveRewardRuleForSession,
  toggleRewardRuleForSession,
  type RewardsActionState,
} from "./logic";

// Shims delgados: resuelven la sesión desde las cookies verificadas y
// delegan en logic.ts (que NO es "use server" — ver el comentario ahí). El
// gate completo (sesión + rol owner + validación) corre en cada invocación
// por wire. revalidatePath vive acá, no en logic: solo existe dentro de una
// request real de Next.js.
export async function saveProgramAction(
  _prevState: RewardsActionState,
  formData: FormData,
): Promise<RewardsActionState> {
  const session = await requireTenantSession();
  const result = await saveProgramForSession(session, formData);
  if (result.success) {
    revalidatePath("/rewards");
  }
  return result;
}

export async function saveRewardRuleAction(
  _prevState: RewardsActionState,
  formData: FormData,
): Promise<RewardsActionState> {
  const session = await requireTenantSession();
  const result = await saveRewardRuleForSession(session, formData);
  if (result.success) {
    revalidatePath("/rewards");
  }
  return result;
}

export async function toggleRewardRuleAction(
  _prevState: RewardsActionState,
  formData: FormData,
): Promise<RewardsActionState> {
  const session = await requireTenantSession();
  const result = await toggleRewardRuleForSession(session, formData);
  if (result.success) {
    revalidatePath("/rewards");
  }
  return result;
}
