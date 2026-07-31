import { createHash } from "node:crypto";
import type { RgbColor } from "@loyalty/wallet";

// Color de marca derivado determinísticamente del business_id — sin
// columna nueva en el esquema (no se pidió, y un hash estable ya da
// diferenciación visual real por negocio). Compartido entre Apple y
// Google para que el mismo negocio tenga el mismo color en ambas
// plataformas. Cuando exista branding real (columna en /rewards), esto se
// reemplaza; el resto del pipeline no cambia.
export function deriveBrandColor(businessId: string): RgbColor {
  const hash = createHash("sha256").update(businessId).digest();
  // Evita colores casi-blancos/casi-negros (mal contraste con el ícono
  // sólido/fondo) acotando cada canal a [40, 215].
  const clamp = (byte: number) => 40 + (byte % 176);
  return [clamp(hash[0]), clamp(hash[1]), clamp(hash[2])];
}
