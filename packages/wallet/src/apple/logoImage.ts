import sharp from "sharp";

// logo.png de storeCard: se muestra arriba a la izquierda del pase, junto
// a organizationName. Wallet ajusta por ALTURA (no por ancho) — 50pt @1x
// es el límite alto convencional que respetan casi todos los pases reales
// (Starbucks, Dunkin, etc.); acá se resuelve por altura y se deja el
// ancho proporcional, sin recorte — el logo real de CHILAQUIKES ya es
// cuadrado con fondo transparente, así que entra sin distorsión.
const BASE_HEIGHT = 50;

export async function buildLogoImage(logoPngBuffer: Buffer, scale: 1 | 2 | 3): Promise<Buffer> {
  const height = BASE_HEIGHT * scale;
  return sharp(logoPngBuffer)
    .resize({ height, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}
