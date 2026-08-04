import { appDb } from "./client";
import { marketingLeads } from "./schema";

// Superficie separada a propósito de src/index.ts, mismo criterio que
// admin.ts: cualquier import de "@loyalty/db/marketing" declara
// explícitamente que ese código escribe la tabla pública de leads.
//
// Usa appDb DIRECTO, sin withTenantContext(): `marketing_leads` no tiene
// business_id ni RLS (es un lead de PRE-venta, capturado antes de que
// exista ningún negocio — ver el comentario en
// src/schema/marketingLeads.ts), así que no hay ningún business_id que
// fijar con SET LOCAL. Sigue siendo el rol app_user (nunca adminDb): esta
// función la invoca una request pública normal desde el sitio de
// marketing, y "adminDb nunca sirve una request normal" es una regla no
// negociable de este proyecto — adminDb queda confinado a
// migraciones/seed/tests/el alta de negocios en /admin. app_user tiene
// permiso GRANT INSERT (únicamente INSERT, ver la migración) sobre esta
// tabla, así que un INSERT directo con appDb es correcto y suficiente.
export type MarketingLeadInput = {
  contactName: string;
  businessName: string;
  phone: string;
  email?: string | null;
  message?: string | null;
};

export async function insertMarketingLead(input: MarketingLeadInput): Promise<void> {
  await appDb.insert(marketingLeads).values({
    contactName: input.contactName,
    businessName: input.businessName,
    phone: input.phone,
    email: input.email ?? null,
    message: input.message ?? null,
  });
}
