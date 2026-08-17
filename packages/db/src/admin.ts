import { eq } from "drizzle-orm";
import { adminDb } from "./client";
import { auditLogs, businesses, locations, loyaltyPrograms, rewardRules, roles, users } from "./schema";

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
  // Opcionales — el flujo mínimo original (solo negocio+dueño) sigue
  // funcionando idéntico sin pasarlos. Cuando se dan, arman el arranque
  // completo en UNA sola operación (antes: 2 scripts + SQL manual, ver
  // CLAUDE.md).
  initialLocationName?: string;
  // Programa placeholder: solo se crea si se da un valor > 0. La
  // recompensa placeholder usa el MISMO stampsRequired que el programa —
  // respeta el tope ya validado en /rewards (ver
  // saveRewardRuleForSession: una recompensa nunca puede pedir más sellos
  // que el ciclo del programa).
  initialStampsRequired?: number;
  brandColorHex?: string;
  logoUrl?: string;
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
        brandColorHex: input.brandColorHex,
        logoUrl: input.logoUrl,
      })
      .returning();

    const [owner] = await tx
      .insert(users)
      .values({
        businessId: business.id,
        authUserId: input.ownerAuthUserId,
        email: input.ownerEmail,
        roleId: ownerRole.id,
      })
      .returning();

    if (input.initialLocationName) {
      await tx.insert(locations).values({
        businessId: business.id,
        name: input.initialLocationName,
        createdBy: owner.id,
        updatedBy: owner.id,
      });
    }

    if (input.initialStampsRequired && input.initialStampsRequired > 0) {
      const [program] = await tx
        .insert(loyaltyPrograms)
        .values({
          businessId: business.id,
          name: "Programa de sellos",
          stampsRequired: input.initialStampsRequired,
          createdBy: owner.id,
          updatedBy: owner.id,
        })
        .returning();

      await tx.insert(rewardRules).values({
        businessId: business.id,
        loyaltyProgramId: program.id,
        name: "Recompensa",
        stampsRequired: input.initialStampsRequired,
        createdBy: owner.id,
        updatedBy: owner.id,
      });
    }

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
