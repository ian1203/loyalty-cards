// Genera los assets ESTÁTICOS de un pase de Apple Wallet (logo + strip, en
// @1x/@2x/@3x) a partir de un logo transparente y una foto hero fuente —
// SIEMPRE offline, nunca en el request serverless. Decisión de
// arquitectura (ver commit): sharp no carga su binario nativo en el
// runtime de Vercel pese a varios intentos reales de arreglarlo, así que
// el pase de Apple deja de compositar nada en runtime — logo/strip son
// PNGs ya hechos, leídos con fs.readFileSync. sharp queda SOLO como
// devDependency, para este script.
//
// Dimensiones storeCard (validadas visualmente en una ronda anterior,
// coherentes con el estándar ampliamente documentado — mismo tamaño que
// coupon/eventTicket): logo se ajusta por ALTURA (50/100/150pt),
// strip 312x123pt @1x (624x246 @2x, 936x369 @3x).
//
// Uso: pnpm --filter @loyalty/wallet generate-pass-assets -- \
//   --slug chilaquikes \
//   --logo ../../chilaquikes-logo-pass.png \
//   --hero ../../chilaquikes/heroChilaquiles.jpg
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "../../..");
const PUBLIC_PASSES_DIR = path.join(REPO_ROOT, "apps/web/public/passes");

const LOGO_BASE_HEIGHT = 50;
const STRIP_BASE_WIDTH = 312;
const STRIP_BASE_HEIGHT = 123;

function parseArgs(argv: string[]): { slug: string; logo: string; hero: string } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const slug = get("--slug");
  const logo = get("--logo");
  const hero = get("--hero");
  if (!slug || !logo || !hero) {
    throw new Error("Uso: --slug <slug> --logo <ruta al PNG transparente> --hero <ruta a la foto>");
  }
  return { slug, logo, hero };
}

async function main() {
  const { slug, logo, hero } = parseArgs(process.argv.slice(2));
  const outDir = path.join(PUBLIC_PASSES_DIR, slug);
  await mkdir(outDir, { recursive: true });

  const logoPath = path.resolve(process.cwd(), logo);
  const heroPath = path.resolve(process.cwd(), hero);

  // Logo: se ajusta por altura, ancho proporcional, SIN recorte — el
  // alpha del PNG fuente se preserva (Apple lo compone sobre
  // backgroundColor, no sobre blanco).
  for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
    await sharp(logoPath)
      .resize({ height: LOGO_BASE_HEIGHT * scale, fit: "inside", withoutEnlargement: false })
      .png()
      .toFile(path.join(outDir, `logo${suffix}.png`));
  }

  // Strip: cover al aspecto ancho de PassKit, foco automático (evita
  // cortar justo la parte más "interesante" de la foto).
  for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
    await sharp(heroPath)
      .resize(STRIP_BASE_WIDTH * scale, STRIP_BASE_HEIGHT * scale, { fit: "cover", position: "attention" })
      .png()
      .toFile(path.join(outDir, `strip${suffix}.png`));
  }

  console.log(`[generate-pass-assets] Listo: ${outDir}`);
  console.log("  logo.png, logo@2x.png, logo@3x.png");
  console.log("  strip.png, strip@2x.png, strip@3x.png");
}

main().catch((error) => {
  console.error("[generate-pass-assets] Falló:", error);
  process.exit(1);
});
