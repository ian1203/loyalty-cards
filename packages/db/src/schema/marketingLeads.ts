import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Landing de marketing pública, deliberadamente fuera del modelo tenant: un
// lead se captura ANTES de que exista ningún negocio, así que no hay
// business_id al que asociarlo y no aplica RLS (no hay columna tenant por la
// que aislar). A diferencia de platform_admins (adminDb-only), esta tabla la
// escribe una request pública sin sesión — usar adminDb ahí violaría la
// regla de "el rol de servicio nunca sirve una request normal", así que
// app_user necesita permiso, pero solo INSERT: leer leads es una tarea
// manual/operativa por ahora, nunca expuesta en la app pública.
export const marketingLeads = pgTable("marketing_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactName: text("contact_name").notNull(),
  businessName: text("business_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
