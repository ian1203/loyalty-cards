import { readFile } from "node:fs/promises";
import path from "node:path";

// Resuelve un asset de marca de negocio (logo, hero) a bytes crudos —
// acepta tanto una URL externa real (Cloudinary, etc., a futuro) como una
// ruta relativa servida por apps/web/public (lo que usa Chilaquikes hoy:
// "/brand/chilaquikes-hero.jpg"). Nunca lanza: un asset roto/ausente no
// debe tumbar la generación del pase completo, solo esa pieza visual —
// ver el criterio best-effort ya establecido para el resto de Wallet
// (notifyWalletOfTransaction).
export async function resolveBusinessAssetBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`resolveBusinessAssetBuffer: ${url} respondió ${response.status}`);
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    }

    const relative = url.replace(/^\/+/, "");
    const filePath = path.join(process.cwd(), "public", relative);
    return await readFile(filePath);
  } catch (error) {
    console.warn(`resolveBusinessAssetBuffer: no se pudo leer ${url}:`, error);
    return null;
  }
}
