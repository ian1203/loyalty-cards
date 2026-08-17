import { and, desc, eq, ne } from "drizzle-orm";
import { auditLogs, businesses, locations, type businessStatusEnum } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { isUuid } from "../../lib/tenant";
import type { PlatformRole } from "../../lib/supabase/session";

// Vive bajo app/admin/ (no lib/) por el mismo motivo que impersonation.ts:
// ese árbol completo ya está exento del guard "cero @loyalty/db/admin
// fuera de /admin" — esta ES la lógica de escritura del panel, no un
// helper genérico. Sin "use server": recibe la identidad/rol del admin ya
// resueltos por requirePlatformAdmin() como parámetros, nunca desde
// cookies acá directamente (ver el mismo razonamiento en cualquier
// logic.ts de feature).

type BusinessStatus = (typeof businessStatusEnum.enumValues)[number];

function requireOwner(platformRole: PlatformRole): void {
  // Chequeo real, no solo ocultar el botón en la UI (mismo principio que
  // el resto del sistema) — cada acción mutante de /admin lo repite acá,
  // en la capa de lógica, nunca solo en el shim de actions.ts.
  if (platformRole !== "owner") {
    throw new Error("Solo un admin de plataforma con rol owner puede realizar esta acción.");
  }
}

export async function listBusinesses() {
  return adminDb
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      status: businesses.status,
      plan: businesses.plan,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(ne(businesses.status, "deleted"))
    .orderBy(desc(businesses.createdAt));
}

export async function getBusinessDetail(businessId: string) {
  if (!isUuid(businessId)) return null;

  const [business] = await adminDb
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!business) return null;

  const businessLocations = await adminDb
    .select()
    .from(locations)
    .where(eq(locations.businessId, businessId))
    .orderBy(desc(locations.createdAt));

  return { business, locations: businessLocations };
}

export async function createLocationForBusiness(
  adminAuthUserId: string,
  adminPlatformRole: PlatformRole,
  businessId: string,
  input: { name: string; address?: string; latitude?: number; longitude?: number },
): Promise<void> {
  requireOwner(adminPlatformRole);

  const [location] = await adminDb
    .insert(locations)
    .values({
      businessId,
      name: input.name,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .returning();

  await adminDb.insert(auditLogs).values({
    businessId,
    actorAuthUserId: adminAuthUserId,
    action: "location.created",
    entityType: "location",
    entityId: location.id,
    metadata: { name: input.name },
  });
}

export async function updateLocationForBusiness(
  adminAuthUserId: string,
  adminPlatformRole: PlatformRole,
  businessId: string,
  locationId: string,
  input: {
    name: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    isActive: boolean;
  },
): Promise<void> {
  requireOwner(adminPlatformRole);

  await adminDb
    .update(locations)
    .set({
      name: input.name,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(locations.id, locationId), eq(locations.businessId, businessId)));

  await adminDb.insert(auditLogs).values({
    businessId,
    actorAuthUserId: adminAuthUserId,
    action: "location.updated",
    entityType: "location",
    entityId: locationId,
    metadata: { name: input.name, isActive: input.isActive },
  });
}

export type BrandingInput = {
  brandColorHex?: string;
  logoUrl?: string;
  walletLogoUrl?: string;
  walletHeroUrl?: string;
  googleLogoUri?: string;
  googleHeroUri?: string;
  googleWideLogoUri?: string;
};

export async function updateBusinessBranding(
  adminAuthUserId: string,
  adminPlatformRole: PlatformRole,
  businessId: string,
  input: BrandingInput,
): Promise<void> {
  requireOwner(adminPlatformRole);

  await adminDb
    .update(businesses)
    .set({
      brandColorHex: input.brandColorHex || null,
      logoUrl: input.logoUrl || null,
      walletLogoUrl: input.walletLogoUrl || null,
      walletHeroUrl: input.walletHeroUrl || null,
      googleLogoUri: input.googleLogoUri || null,
      googleHeroUri: input.googleHeroUri || null,
      googleWideLogoUri: input.googleWideLogoUri || null,
      updatedAt: new Date(),
      updatedBy: adminAuthUserId,
    })
    .where(eq(businesses.id, businessId));

  await adminDb.insert(auditLogs).values({
    businessId,
    actorAuthUserId: adminAuthUserId,
    action: "business.branding_updated",
    entityType: "business",
    entityId: businessId,
    metadata: input,
  });
}

// active/suspended/unpaid — 'deleted' pasa por softDeleteBusiness (acción
// separada, irreversible en la práctica, con su propia confirmación en la
// UI en vez de compartir el mismo <select>).
//
// Sin requireOwner() a propósito: pedido explícito del negocio, un admin
// viewer SÍ puede suspender/marcar pago pendiente/reactivar un negocio —
// a diferencia de crear/eliminar negocios, editar sucursales/branding o
// gestionar cuentas de plataforma, que siguen exclusivos de owner. El
// parámetro adminPlatformRole se conserva para el audit log, no para
// restringir esta acción.
export async function setBusinessStatus(
  adminAuthUserId: string,
  adminPlatformRole: PlatformRole,
  businessId: string,
  status: Extract<BusinessStatus, "active" | "suspended" | "unpaid">,
): Promise<void> {
  await adminDb
    .update(businesses)
    .set({ status, updatedAt: new Date(), updatedBy: adminAuthUserId })
    .where(eq(businesses.id, businessId));

  await adminDb.insert(auditLogs).values({
    businessId,
    actorAuthUserId: adminAuthUserId,
    action: "business.status_changed",
    entityType: "business",
    entityId: businessId,
    metadata: { status, actingPlatformRole: adminPlatformRole },
  });
}

// Soft-delete: nunca DELETE físico (todas las FK hacia businesses.id son
// ON DELETE no action, un DELETE real fallaría contra cualquier negocio
// con datos) — oculta de listBusinesses() (filtra status != 'deleted') sin
// romper ninguna referencia histórica.
export async function softDeleteBusiness(
  adminAuthUserId: string,
  adminPlatformRole: PlatformRole,
  businessId: string,
): Promise<void> {
  requireOwner(adminPlatformRole);

  await adminDb
    .update(businesses)
    .set({ status: "deleted", updatedAt: new Date(), updatedBy: adminAuthUserId })
    .where(eq(businesses.id, businessId));

  await adminDb.insert(auditLogs).values({
    businessId,
    actorAuthUserId: adminAuthUserId,
    action: "business.deleted",
    entityType: "business",
    entityId: businessId,
    metadata: {},
  });
}
