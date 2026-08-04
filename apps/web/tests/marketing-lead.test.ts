import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { marketingLeads } from "@loyalty/db";
import { adminDb } from "@loyalty/db/admin";
import { submitMarketingLead } from "../app/(marketing)/lib/leadLogic";

// A diferencia de toda otra feature, este flujo NO tiene sesión ni tenant
// que aislar (ver packages/db/src/schema/marketingLeads.ts): es un
// formulario público de la landing de marketing, capturado ANTES de que
// exista ningún negocio. Lo que hay que probar acá es distinto del resto
// de la suite: no anti-IDOR (no hay tenant), sino que la escritura real
// pasa por app_user (insertMarketingLead usa appDb directo, nunca adminDb
// — ver packages/db/src/marketing.ts) y que la validación de input rechaza
// datos incompletos antes de tocar la DB.
describe("landing de marketing — formulario de demo", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const insertedContactNames: string[] = [];

  afterAll(async () => {
    for (const contactName of insertedContactNames) {
      await adminDb.delete(marketingLeads).where(eq(marketingLeads.contactName, contactName));
    }
  });

  function buildFormData(fields: Record<string, string>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("inserta un lead válido y confirma la fila en DB (vía app_user, no adminDb)", async () => {
    const contactName = `Lead Test ${suffix}`;
    insertedContactNames.push(contactName);

    const result = await submitMarketingLead(
      buildFormData({
        contactName,
        businessName: "Cafetería de prueba",
        phone: "+52 229 000 0000",
        email: "lead@example.com",
        message: "Quiero una demo",
      }),
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toBeTruthy();

    const rows = await adminDb.select().from(marketingLeads).where(eq(marketingLeads.contactName, contactName));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.businessName).toBe("Cafetería de prueba");
    expect(rows[0]?.email).toBe("lead@example.com");
  });

  it("acepta email y mensaje opcionales vacíos", async () => {
    const contactName = `Lead Minimal ${suffix}`;
    insertedContactNames.push(contactName);

    const result = await submitMarketingLead(
      buildFormData({
        contactName,
        businessName: "Negocio mínimo",
        phone: "2290000000",
      }),
    );

    expect(result.success).toBeTruthy();

    const rows = await adminDb.select().from(marketingLeads).where(eq(marketingLeads.contactName, contactName));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBeNull();
    expect(rows[0]?.message).toBeNull();
  });

  it("rechaza sin insertar cuando falta el nombre de contacto", async () => {
    const result = await submitMarketingLead(
      buildFormData({ contactName: "", businessName: "Negocio", phone: "2290000000" }),
    );
    expect(result.error).toBeTruthy();
    expect(result.success).toBeUndefined();
  });

  it("rechaza sin insertar cuando falta el teléfono", async () => {
    const contactName = `Lead Sin Telefono ${suffix}`;
    const result = await submitMarketingLead(
      buildFormData({ contactName, businessName: "Negocio", phone: "" }),
    );
    expect(result.error).toBeTruthy();

    const rows = await adminDb.select().from(marketingLeads).where(eq(marketingLeads.contactName, contactName));
    expect(rows).toHaveLength(0);
  });

  it("rechaza un email malformado sin insertar", async () => {
    const contactName = `Lead Email Malo ${suffix}`;
    const result = await submitMarketingLead(
      buildFormData({
        contactName,
        businessName: "Negocio",
        phone: "2290000000",
        email: "no-es-un-correo",
      }),
    );
    expect(result.error).toBeTruthy();

    const rows = await adminDb.select().from(marketingLeads).where(eq(marketingLeads.contactName, contactName));
    expect(rows).toHaveLength(0);
  });
});
