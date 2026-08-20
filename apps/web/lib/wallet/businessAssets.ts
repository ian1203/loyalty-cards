// Resuelve un asset de marca de negocio (logo, hero) a bytes crudos —
// exige una URL https:// pública (Cloudinary, o el propio dominio de la
// app sirviendo apps/web/public vía CDN, ej.
// "https://www.pragmia-data.com/passes/chilaquikes/logo.png"). Antes
// aceptaba también una ruta relativa leída con fs.readFile(process.cwd() +
// "public" + ...) — se quitó tras confirmar en producción que
// @vercel/nft no traza esa lectura de forma consistente entre bundles de
// función distintos: /api/wallet/apple/v1/passes y
// /api/wallet/apple/download incluían los archivos, pero
// (marketing)/enroll/[slug]/page.tsx (mismo deploy, misma ruta relativa)
// daba ENOENT — confirmado con curl real contra los tres. Nunca lanza: un
// asset roto/ausente no debe tumbar la generación del pase completo, solo
// esa pieza visual — ver el criterio best-effort ya establecido para el
// resto de Wallet (notifyWalletOfTransaction).
//
// Cache en memoria por proceso (hallazgo real de auditoría de rendimiento,
// ver docs/HISTORY.md): sin esto, cada .pkpass generado dispara hasta 9
// fetches HTTPS de vuelta al propio dominio (logo/strip/icon × 1x/2x/3x)
// por request — confirmado en logs reales de producción,
// /customers/{id}/wallet/apple tardando consistentemente 2.7-3.3s. Estos
// archivos son branding estático que solo cambia cuando alguien re-corre
// generate-pass-assets.ts (acción manual, rara) — un TTL de 10 minutos
// evita servir un asset viejo indefinidamente sin reintroducir el costo
// del fetch en cada request. NUNCA cachea un `null` (asset roto/ausente):
// un fallo transitorio de red no debe quedar pegado 10 minutos.
const ASSET_CACHE_TTL_MS = 10 * 60 * 1000;
const assetCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

export async function resolveBusinessAssetBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) {
    return null;
  }

  if (!/^https?:\/\//i.test(url)) {
    console.warn(`resolveBusinessAssetBuffer: ${url} no es una URL https:// pública — se ignora.`);
    return null;
  }

  const cached = assetCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.buffer;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`resolveBusinessAssetBuffer: ${url} respondió ${response.status}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    assetCache.set(url, { buffer, expiresAt: Date.now() + ASSET_CACHE_TTL_MS });
    return buffer;
  } catch (error) {
    console.warn(`resolveBusinessAssetBuffer: no se pudo leer ${url}:`, error);
    return null;
  }
}

// Solo para tests — mismo patrón que __resetWalletAdaptersForTests
// (lib/wallet/adapters.ts): un cache module-level persiste entre tests del
// mismo archivo/proceso si nadie lo limpia.
export function __resetBusinessAssetCacheForTests(): void {
  assetCache.clear();
}
