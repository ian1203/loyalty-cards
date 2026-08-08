// logo.png de storeCard: se muestra arriba a la izquierda del pase, junto
// a organizationName. Wallet ajusta por ALTURA (no por ancho) — 50pt @1x
// es el límite alto convencional que respetan casi todos los pases reales
// (Starbucks, Dunkin, etc.); acá se resuelve por altura y se deja el
// ancho proporcional, sin recorte — el logo real de CHILAQUIKES ya es
// cuadrado con fondo transparente, así que entra sin distorsión.
const BASE_HEIGHT = 50;

// import() dinámico a propósito (bug real de producción): un `import
// sharp from "sharp"` estático arriba del archivo hace que Node cargue el
// binario nativo apenas algo importa este módulo — incluso un negocio SIN
// logo/hero cargado, porque el import ocurre al construir el grafo de
// módulos, no al llamar la función. Eso reventaba /enroll y /scanner
// completos (500 duro, antes de que corriera código propio) cuando el
// binario linux-x64 de sharp no cargaba en el runtime de Vercel — ni
// serverExternalPackages ni forzar webpack lo arreglaron del todo. Con
// import() dentro de la función, sharp solo se carga cuando de verdad
// hay un logo que procesar, y un fallo ahí sí lo atrapa el try/catch de
// publicEnrollWallet.ts (best-effort, no tumba el resto del enroll).
export async function buildLogoImage(logoPngBuffer: Buffer, scale: 1 | 2 | 3): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const height = BASE_HEIGHT * scale;
  return sharp(logoPngBuffer)
    .resize({ height, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}
