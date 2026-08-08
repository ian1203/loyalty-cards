import type { RgbColor } from "./placeholderIcon";

// strip.png de storeCard: banner que Wallet muestra debajo del header
// (logo/logoText) y arriba de los primaryFields — el "hero" de PassKit
// para este estilo de pase. Dimensión clásica @1x = 312x123 (misma que
// coupon/eventTicket). Se genera SIEMPRE al vuelo, nunca se pre-procesa a
// mano: la foto/color de marca son estáticos por negocio, pero el conteo
// de sellos cambia por cliente en cada llamada.
const BASE_WIDTH = 312;
const BASE_HEIGHT = 123;

// "Ganado" vs "no ganado" se distingue por COLOR real (a diferencia de un
// campo de texto de PassKit, que solo admite un labelColor global para
// todo el pase) — esta es la razón de compositar una imagen en vez de
// usar glifos Unicode en un campo.
const STAMP_FILLED = { r: 255, g: 199, b: 44 }; // dorado
const STAMP_EMPTY = { r: 217, g: 183, b: 156 }; // marrón claro/tostado

export type StripImageInput = {
  heroImageBuffer: Buffer; // JPEG o PNG de la foto del negocio, cualquier tamaño
  bandRgb: RgbColor; // color de fondo del pase — también rellena el área bajo la foto
  currentStamps: number;
  stampsRequired: number;
  scale: 1 | 2 | 3;
};

// import() dinámico a propósito — mismo motivo que logoImage.ts: un
// import estático de sharp revienta /enroll y /scanner completos (500
// duro) apenas algo importa este módulo, incluso para negocios sin hero
// cargado. Con import() dentro de la función, un fallo del binario nativo
// lo atrapa el try/catch best-effort de publicEnrollWallet.ts.
export async function buildStripImage(input: StripImageInput): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const width = BASE_WIDTH * input.scale;
  const height = BASE_HEIGHT * input.scale;
  // La foto ocupa la porción de arriba; una banda sólida del color de
  // marca abajo trae los sellos — nunca se leen sobre la foto directo
  // (el contraste dependería de qué haya justo ahí en la imagen).
  const photoHeight = Math.round(height * 0.66);
  const bandHeight = height - photoHeight;
  const [r, g, b] = input.bandRgb;
  const brand = { r, g, b };

  const photo = await sharp(input.heroImageBuffer)
    .resize(width, photoHeight, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();

  const filled = Math.max(0, Math.min(Math.round(input.currentStamps), input.stampsRequired));
  const total = Math.max(1, input.stampsRequired);
  const empty = total - filled;

  // Radio acotado por dos límites: no más alto que la banda, no más ancho
  // que lo que quepa en fila — así un programa con muchos sellos
  // (stampsRequired grande) no desborda el strip.
  const radiusByHeight = bandHeight * 0.26;
  const radiusByWidth = (width * 0.86) / (total * 2.4);
  const radius = Math.min(radiusByHeight, radiusByWidth);
  const gap = (width - radius * 2 * total) / (total + 1);
  const cy = photoHeight + bandHeight / 2;

  let circles = "";
  for (let i = 0; i < total; i++) {
    const cx = gap + radius + i * (radius * 2 + gap);
    const fill = i < filled ? STAMP_FILLED : STAMP_EMPTY;
    circles += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="rgb(${fill.r},${fill.g},${fill.b})"/>`;
  }

  // rect + circles nada más — sin <text>: el runtime serverless de
  // Vercel no garantiza fuentes instaladas para que libvips/librsvg
  // rasterice texto (tofu boxes silenciosos). Cualquier texto real del
  // pase (incluido "Powered by Pragmia") va en backFields, renderizado
  // por Wallet mismo, no horneado en un bitmap.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="0" y="${photoHeight}" width="${width}" height="${bandHeight}" fill="rgb(${brand.r},${brand.g},${brand.b})"/>
    ${circles}
  </svg>`;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: brand.r, g: brand.g, b: brand.b, alpha: 1 },
    },
  })
    .composite([
      { input: photo, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
