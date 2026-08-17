"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../lib/supabase/session";
import {
  createLocationForBusiness,
  setBusinessStatus,
  softDeleteBusiness,
  updateBusinessBranding,
  updateLocationForBusiness,
} from "./businesses";

export type AdminActionState = { error?: string; success?: string };

function parseOptionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseOptionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function createLocationAction(
  businessId: string,
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre de la sucursal es obligatorio." };

  try {
    await createLocationForBusiness(admin.authUserId, admin.platformRole, businessId, {
      name,
      address: parseOptionalString(formData.get("address")),
      latitude: parseOptionalNumber(formData.get("latitude")),
      longitude: parseOptionalNumber(formData.get("longitude")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo crear la sucursal: ${message}` };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: `Sucursal "${name}" creada.` };
}

export async function updateLocationAction(
  businessId: string,
  locationId: string,
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre de la sucursal es obligatorio." };

  try {
    await updateLocationForBusiness(admin.authUserId, admin.platformRole, businessId, locationId, {
      name,
      address: parseOptionalString(formData.get("address")),
      latitude: parseOptionalNumber(formData.get("latitude")),
      longitude: parseOptionalNumber(formData.get("longitude")),
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo actualizar la sucursal: ${message}` };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: "Sucursal actualizada." };
}

export async function updateBrandingAction(
  businessId: string,
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  try {
    await updateBusinessBranding(admin.authUserId, admin.platformRole, businessId, {
      brandColorHex: parseOptionalString(formData.get("brandColorHex")),
      logoUrl: parseOptionalString(formData.get("logoUrl")),
      walletLogoUrl: parseOptionalString(formData.get("walletLogoUrl")),
      walletHeroUrl: parseOptionalString(formData.get("walletHeroUrl")),
      googleLogoUri: parseOptionalString(formData.get("googleLogoUri")),
      googleHeroUri: parseOptionalString(formData.get("googleHeroUri")),
      googleWideLogoUri: parseOptionalString(formData.get("googleWideLogoUri")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo actualizar el branding: ${message}` };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: "Branding actualizado." };
}

export async function setBusinessStatusAction(
  businessId: string,
  status: "active" | "suspended" | "unpaid",
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  try {
    await setBusinessStatus(admin.authUserId, admin.platformRole, businessId, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo cambiar el estado: ${message}` };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/admin");
  return { success: "Estado actualizado." };
}

export async function softDeleteBusinessAction(businessId: string): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { error: "No autorizado." };

  try {
    await softDeleteBusiness(admin.authUserId, admin.platformRole, businessId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo eliminar el negocio: ${message}` };
  }

  revalidatePath("/admin");
  return { success: "Negocio eliminado." };
}
