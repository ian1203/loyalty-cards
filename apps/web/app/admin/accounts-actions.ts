"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../lib/supabase/session";
import {
  changePlatformAdminRole,
  invitePlatformAdmin,
  setPlatformAdminActive,
} from "./accounts";
import type { AdminActionState } from "./businesses-actions";

const PLATFORM_ROLES = new Set(["owner", "viewer"]);

export async function invitePlatformAdminAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  const email = String(formData.get("email") ?? "").trim();
  const platformRole = String(formData.get("platformRole") ?? "");
  if (!email || !PLATFORM_ROLES.has(platformRole)) {
    return { error: "Correo y rol son obligatorios." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { error: "NEXT_PUBLIC_SITE_URL no está configurado." };
  }

  try {
    await invitePlatformAdmin(
      admin.authUserId,
      admin.platformRole,
      email,
      platformRole as "owner" | "viewer",
      siteUrl,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo invitar a la cuenta: ${message}` };
  }

  revalidatePath("/admin/accounts");
  return { success: `Invitación enviada a ${email}.` };
}

export async function setPlatformAdminActiveAction(
  targetAuthUserId: string,
  isActive: boolean,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  try {
    await setPlatformAdminActive(admin.authUserId, admin.platformRole, targetAuthUserId, isActive);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo actualizar la cuenta: ${message}` };
  }

  revalidatePath("/admin/accounts");
  return { success: isActive ? "Cuenta reactivada." : "Cuenta desactivada." };
}

export async function changePlatformAdminRoleAction(
  targetAuthUserId: string,
  platformRole: "owner" | "viewer",
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  try {
    await changePlatformAdminRole(admin.authUserId, admin.platformRole, targetAuthUserId, platformRole);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo cambiar el rol: ${message}` };
  }

  revalidatePath("/admin/accounts");
  return { success: "Rol actualizado." };
}
