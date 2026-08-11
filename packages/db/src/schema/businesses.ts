import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { platformAdmins } from "./platformAdmins";

export const businessStatusEnum = pgEnum("business_status", [
  "active",
  "suspended",
]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: businessStatusEnum("status").notNull().default("active"),
  // URL pública del logo del negocio (para el form de /enroll y futuros
  // usos de marca) — nullable a propósito: un negocio sin logo cargado
  // simplemente no lo muestra, nunca un placeholder inventado. No es dato
  // sensible, no necesita RLS más allá de la política existente de
  // businesses.
  logoUrl: text("logo_url"),
  // Color de marca real en hex (ej. "#DB0A00") — cuando está seteado,
  // reemplaza el color hash-derivado de deriveBrandColor()
  // (apps/web/lib/wallet/brandColor.ts), que sigue como fallback para
  // negocios sin branding real cargado todavía. Mismo criterio nullable
  // que logoUrl: sin valor, sin placeholder inventado.
  brandColorHex: text("brand_color_hex"),
  // URL del hero/strip para el .pkpass de Apple (imagen ancha, ej. foto
  // de producto) — nullable: sin ella, el pase sigue el layout plano
  // actual, nunca un placeholder genérico. SIEMPRE una URL https:// pública
  // (mismo criterio que google_logo_uri/google_hero_uri abajo) — nunca una
  // ruta relativa a apps/web/public. Se intentó (Chilaquikes) y falló en
  // producción: @vercel/nft no traza de forma consistente un
  // fs.readFile(path.join(process.cwd(), "public", ...)) con ruta dinámica
  // — el bundle de /api/wallet/apple/{v1/passes,download} sí incluía esos
  // archivos, pero el de (marketing)/enroll/[slug]/page.tsx no (mismo
  // deploy, mismo archivo, ENOENT solo ahí) — confirmado con curl real
  // contra los tres endpoints. resolveBusinessAssetBuffer ya no soporta
  // rutas relativas por esto (ver apps/web/lib/wallet/businessAssets.ts).
  walletHeroUrl: text("wallet_hero_url"),
  // Logo para el HEADER del .pkpass de Apple — deliberadamente separado
  // de logoUrl (el de /enroll, un crop circular distinto): reusar el
  // mismo campo hubiera cambiado lo que ya se ve en /enroll, que quedó
  // aprobado y no debía tocarse.
  walletLogoUrl: text("wallet_logo_url"),
  // URLs de Google Wallet — mismo criterio de URL https:// pública que
  // wallet_logo_url/wallet_hero_url de arriba (Google exige poder ir a
  // buscarlas desde su propio servidor; nunca funcionarían como ruta
  // relativa). Nullable: sin ellas la Loyalty Class queda sin esa pieza,
  // nunca un placeholder inventado.
  googleLogoUri: text("google_logo_uri"),
  googleHeroUri: text("google_hero_uri"),
  // Wordmark horizontal (ratio 3:1) — nullable a propósito: el asset
  // real todavía no existe (bloqueado en Narciso al momento de este
  // commit). El código ya sabe usarla en cuanto tenga valor.
  googleWideLogoUri: text("google_wide_logo_uri"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // FK real ahora que platform_admins existe (Fase 1): un negocio lo crea
  // un admin general, no un users.id — platform_admins no depende de
  // businesses, así que no hay el ciclo que sí existía contra users.id en
  // Fase 0.
  createdBy: uuid("created_by").references(() => platformAdmins.authUserId),
  updatedBy: uuid("updated_by").references(() => platformAdmins.authUserId),
});
