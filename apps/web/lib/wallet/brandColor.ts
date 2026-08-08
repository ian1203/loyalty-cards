import { createHash } from "node:crypto";
import type { RgbColor } from "@loyalty/wallet";

// Color de marca derivado determinísticamente del business_id — sin
// branding real cargado, un hash estable igual da diferenciación visual
// por negocio. Compartido entre Apple y Google para que el mismo negocio
// tenga el mismo color en ambas plataformas.
export function deriveBrandColor(businessId: string): RgbColor {
  const hash = createHash("sha256").update(businessId).digest();
  // Evita colores casi-blancos/casi-negros (mal contraste con el ícono
  // sólido/fondo) acotando cada canal a [40, 215].
  const clamp = (byte: number) => 40 + (byte % 176);
  return [clamp(hash[0]), clamp(hash[1]), clamp(hash[2])];
}

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace("#", "").trim();
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

// businesses.brand_color_hex (0018_aromatic_ogun.sql) es el color de
// marca REAL cuando el negocio lo cargó — reemplaza el hash-derivado de
// arriba, que sigue como fallback para negocios sin branding todavía.
export function resolveBrandColorRgb(businessId: string, brandColorHex: string | null): RgbColor {
  return brandColorHex ? hexToRgb(brandColorHex) : deriveBrandColor(businessId);
}
