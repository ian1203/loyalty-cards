import { eq } from "drizzle-orm";
import { adminDb } from "./client";
import { auditLogs, businesses, roles, users } from "./schema";

// Superficie separada a propósito de src/index.ts: cualquier import de
// "@loyalty/db/admin" es una declaración explícita de que ese código usa el
// rol de servicio (bypassa RLS). Debe quedar confinado al camino de alta de
// negocios en /admin — grep "@loyalty/db/admin" para auditar cada sitio que
// lo usa. Nunca para servir una request normal.
export { adminDb };

export type CreateBusinessWithOwnerInput = {
  businessName: string;
  slug: string;
  ownerEmail: string;
  ownerAuthUserId: string;
  createdByAuthUserId: string;
};

// Transaccional: si cualquier paso falla (rol 'owner' inexistente, slug
// duplicado, etc.) no queda un negocio a medias sin su dueño o sin su
// entrada de auditoría.
export async function createBusinessWithOwner(
  input: CreateBusinessWithOwnerInput,
) {
  return adminDb.transaction(async (tx) => {
    const [ownerRole] = await tx
      .select()
      .from(roles)
      .where(eq(roles.name, "owner"));
    if (!ownerRole) {
      throw new Error(
        "No existe el rol global 'owner' — revisa el seed de roles.",
      );
    }

    const [business] = await tx
      .insert(businesses)
      .values({
        name: input.businessName,
        slug: input.slug,
        createdBy: input.createdByAuthUserId,
      })
      .returning();

    await tx.insert(users).values({
      businessId: business.id,
      authUserId: input.ownerAuthUserId,
      email: input.ownerEmail,
      roleId: ownerRole.id,
    });

    await tx.insert(auditLogs).values({
      businessId: business.id,
      actorAuthUserId: input.createdByAuthUserId,
      action: "business.created",
      entityType: "business",
      entityId: business.id,
      metadata: { ownerEmail: input.ownerEmail },
    });

    return business;
  });
}
