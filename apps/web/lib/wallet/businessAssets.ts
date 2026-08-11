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
export async function resolveBusinessAssetBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) {
    return null;
  }

  if (!/^https?:\/\//i.test(url)) {
    console.warn(`resolveBusinessAssetBuffer: ${url} no es una URL https:// pública — se ignora.`);
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`resolveBusinessAssetBuffer: ${url} respondió ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(`resolveBusinessAssetBuffer: no se pudo leer ${url}:`, error);
    return null;
  }
}
