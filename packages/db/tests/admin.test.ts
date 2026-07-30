import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { adminDb, createBusinessWithOwner } from "../src/admin";
import { auditLogs, businesses, platformAdmins, users } from "../src/schema";

describe("createBusinessWithOwner smoke test", () => {
  it("crea negocio + dueño + audit log de forma atómica", async () => {
    const suffix = Date.now();
    const fakeAdminAuthUserId = "00000000-0000-0000-0000-000000000001";
    const fakeOwnerAuthUserId = "00000000-0000-0000-0000-000000000002";

    // No usamos Supabase Auth real aquí (este test es solo de la lógica de
    // DB) — sembramos auth.users/platform_admins mínimos para satisfacer
    // las FKs reales.
    await adminDb.execute(
      sql`insert into auth.users (id) values (${fakeAdminAuthUserId}) on conflict do nothing`,
    );
    await adminDb.execute(
      sql`insert into auth.users (id) values (${fakeOwnerAuthUserId}) on conflict do nothing`,
    );
    await adminDb
      .insert(platformAdmins)
      .values({ authUserId: fakeAdminAuthUserId })
      .onConflictDoNothing();

    const business = await createBusinessWithOwner({
      businessName: `Smoke Admin ${suffix}`,
      slug: `smoke-admin-${suffix}`,
      ownerEmail: `smoke-admin-${suffix}@test.dev`,
      ownerAuthUserId: fakeOwnerAuthUserId,
      createdByAuthUserId: fakeAdminAuthUserId,
    });

    expect(business.name).toBe(`Smoke Admin ${suffix}`);

    const [owner] = await adminDb.select().from(users).where(eq(users.businessId, business.id));
    expect(owner?.email).toBe(`smoke-admin-${suffix}@test.dev`);

    const [log] = await adminDb.select().from(auditLogs).where(eq(auditLogs.businessId, business.id));
    expect(log?.action).toBe("business.created");
    expect(log?.actorAuthUserId).toBe(fakeAdminAuthUserId);

    await adminDb.delete(auditLogs).where(eq(auditLogs.businessId, business.id));
    await adminDb.delete(users).where(eq(users.businessId, business.id));
    await adminDb.delete(businesses).where(eq(businesses.id, business.id));
    await adminDb.delete(platformAdmins).where(eq(platformAdmins.authUserId, fakeAdminAuthUserId));
  });
});
