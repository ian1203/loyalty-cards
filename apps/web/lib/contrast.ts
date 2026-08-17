// Utilidad de contraste WCAG — matemática pura, sin dependencia nueva.
// Hubiera detectado automáticamente el problema real de la paleta pastel
// de Iriz (ver CLAUDE.md): un brand_color_hex elegido sin verificar contra
// los colores FIJOS de texto que Apple pone encima en el pase
// (packages/web/lib/wallet/passGeneration.ts: foregroundRgb/labelRgb,
// [255,244,227]/[255,217,179] cuando hay brandColorHex — nunca cambian,
// así que el único grado de libertad real es el color de fondo).

export type RgbColor = readonly [number, number, number];

// Colores fijos que Apple superpone sobre brandColorHex en el pase — ver
// passGeneration.ts. Nunca cambian sin tocar ese archivo, así que viven
// acá como constantes, no como parámetro.
export const APPLE_PASS_FOREGROUND_RGB: RgbColor = [255, 244, 227];
export const APPLE_PASS_LABEL_RGB: RgbColor = [255, 217, 179];

export function hexToRgb(hex: string): RgbColor | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: RgbColor): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

// Fórmula estándar WCAG 2.x: (L1 + 0.05) / (L2 + 0.05), L1 el más claro.
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

// Umbral WCAG AA para texto normal (4.5:1) — el foreground/label del pase
// son texto pequeño real (nombre del programa, sellos), no un bloque
// decorativo grande.
const WCAG_AA_NORMAL_TEXT = 4.5;

export type BrandColorContrastCheck = {
  foregroundRatio: number;
  labelRatio: number;
  passesForeground: boolean;
  passesLabel: boolean;
};

// Advierte, no bloquea (ver el diseño del panel de admin) — un negocio
// puede tener motivos válidos para un color fuera del ideal, pero el admin
// debe verlo ANTES de guardar, no descubrirlo en un pase real ya entregado
// (que es exactamente lo que pasó con Iriz).
export function checkBrandColorContrast(brandColorHex: string): BrandColorContrastCheck | null {
  const bg = hexToRgb(brandColorHex);
  if (!bg) return null;

  const foregroundRatio = contrastRatio(bg, APPLE_PASS_FOREGROUND_RGB);
  const labelRatio = contrastRatio(bg, APPLE_PASS_LABEL_RGB);

  return {
    foregroundRatio,
    labelRatio,
    passesForeground: foregroundRatio >= WCAG_AA_NORMAL_TEXT,
    passesLabel: labelRatio >= WCAG_AA_NORMAL_TEXT,
  };
}
