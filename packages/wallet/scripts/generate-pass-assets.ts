// Genera los assets ESTÁTICOS de un pase de Apple Wallet (logo + un strip
// POR CADA conteo posible de sellos, en @1x/@2x/@3x) a partir de un logo
// transparente — SIEMPRE offline, nunca en el request serverless. Decisión
// de arquitectura (ver commit): sharp no carga su binario nativo en el
// runtime de Vercel pese a varios intentos reales de arreglarlo, así que
// el pase de Apple deja de compositar nada en runtime — logo/strip son
// PNGs ya hechos, leídos con fs.readFileSync. sharp queda SOLO como
// devDependency, para este script.
//
// El strip YA NO es una foto hero recortada — se intentó aislar el
// emblema/mascota de chilaquikes-logo-pass.png (crop+trim, ver
// chilaquikes-emblem-attempt-NOT-USED.png en la raíz del repo) pero el
// mascota está entrelazado con el wordmark en la misma capa (una mano
// agarra la "A", el cuerpo se mete detrás del contorno negro de
// "QUIKES") — ningún recorte rectangular lo aísla sin arrastrar
// fragmentos de letra. Fallback automático, sin bloquear: fila de
// círculos (rellenos = color de marca sólido, vacíos = contorno gris)
// sobre una banda de fondo sólida elegida por CONTRASTE con el color de
// marca — nunca sello y fondo del mismo color ("nada de sello rojo sobre
// rojo"). passGeneration.ts elige el archivo correcto según
// min(currentStamps, stampsRequired) — ver deriveStampCountUrl ahí.
//
// Dimensiones storeCard (validadas visualmente en una ronda anterior,
// coherentes con el estándar ampliamente documentado — mismo tamaño que
// coupon/eventTicket): logo se ajusta por ALTURA (50/100/150pt),
// strip 312x123pt @1x (624x246 @2x, 936x369 @3x).
//
// Uso: pnpm --filter @loyalty/wallet generate-pass-assets -- \
//   --slug chilaquikes \
//   --logo ../../chilaquikes-logo-pass.png \
//   --stamps-required 6 \
//   --brand-color DB0A00
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

// Banda de fondo del strip: blanco sólido — máximo contraste posible
// contra cualquier color de marca vivo (rojo, verde, azul...) y contra el
// contorno gris de los sellos vacíos. Deliberadamente independiente del
// backgroundColor del pase (ese lo pinta iOS alrededor/debajo del strip,
// no lo compone con estos píxeles): el strip es un PNG opaco, su fondo es
// 100% nuestra elección.
const STRIP_BACKGROUND = "#FFFFFF";
const EMPTY_STAMP_STROKE = "#C4C4C4";
const STRIP_PADDING_X = 20;
const STAMP_GAP_RATIO = 0.32; // gap = diámetro * ratio
const MAX_STAMP_DIAMETER = 60;

type Args = { slug: string; logo: string; stampsRequired: number; brandColor: string };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const slug = get("--slug");
  const logo = get("--logo");
  const stampsRequiredRaw = get("--stamps-required");
  const brandColorRaw = get("--brand-color");
  if (!slug || !logo || !stampsRequiredRaw) {
    throw new Error(
      "Uso: --slug <slug> --logo <ruta al PNG transparente> --stamps-required <n> [--brand-color <hex sin #>]",
    );
  }
  const stampsRequired = Number.parseInt(stampsRequiredRaw, 10);
  if (!Number.isInteger(stampsRequired) || stampsRequired < 1) {
    throw new Error(`--stamps-required inválido: ${stampsRequiredRaw}`);
  }
  // Gris oscuro por default — nunca invisible sobre el fondo blanco del
  // strip si un negocio corre este script sin marca cargada todavía.
  const brandColor = `#${(brandColorRaw ?? "1F1F1F").replace(/^#/, "")}`;
  return { slug, logo, stampsRequired, brandColor };
}

function computeStampLayout(stampsRequired: number): { diameter: number; centersX: number[]; centerY: number } {
  const usableWidth = STRIP_BASE_WIDTH - STRIP_PADDING_X * 2;
  const denom = stampsRequired + (stampsRequired - 1) * STAMP_GAP_RATIO;
  const diameter = Math.min(MAX_STAMP_DIAMETER, usableWidth / denom);
  const gap = diameter * STAMP_GAP_RATIO;
  const totalWidth = stampsRequired * diameter + (stampsRequired - 1) * gap;
  const startX = (STRIP_BASE_WIDTH - totalWidth) / 2;
  const centersX = Array.from({ length: stampsRequired }, (_, i) => startX + diameter / 2 + i * (diameter + gap));
  return { diameter, centersX, centerY: STRIP_BASE_HEIGHT / 2 };
}

function buildStripSvg(filledCount: number, stampsRequired: number, brandColor: string, scale: number): string {
  const { diameter, centersX, centerY } = computeStampLayout(stampsRequired);
  const r = (diameter / 2) * scale;
  const circles = centersX
    .map((cx, i) => {
      const cxS = cx * scale;
      const cyS = centerY * scale;
      if (i < filledCount) {
        return `<circle cx="${cxS}" cy="${cyS}" r="${r - scale}" fill="${brandColor}" />`;
      }
      return `<circle cx="${cxS}" cy="${cyS}" r="${r - 2 * scale}" fill="none" stroke="${EMPTY_STAMP_STROKE}" stroke-width="${2 * scale}" />`;
    })
    .join("\n    ");
  return `<svg width="${STRIP_BASE_WIDTH * scale}" height="${STRIP_BASE_HEIGHT * scale}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${STRIP_BACKGROUND}" />
    ${circles}
  </svg>`;
}

async function main() {
  const { slug, logo, stampsRequired, brandColor } = parseArgs(process.argv.slice(2));
  const outDir = path.join(PUBLIC_PASSES_DIR, slug);
  await mkdir(outDir, { recursive: true });

  const logoPath = path.resolve(process.cwd(), logo);

  // Logo: se ajusta por altura, ancho proporcional, SIN recorte — el
  // alpha del PNG fuente se preserva (Apple lo compone sobre
  // backgroundColor, no sobre blanco).
  for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
    await sharp(logoPath)
      .resize({ height: LOGO_BASE_HEIGHT * scale, fit: "inside", withoutEnlargement: false })
      .png()
      .toFile(path.join(outDir, `logo${suffix}.png`));
  }

  // Strip: un archivo por cada conteo posible de sellos (0..stampsRequired,
  // inclusive) — passGeneration.ts elige el correcto en tiempo de
  // generación del .pkpass según el balance real del cliente.
  for (let filledCount = 0; filledCount <= stampsRequired; filledCount++) {
    for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
      const svg = buildStripSvg(filledCount, stampsRequired, brandColor, scale);
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outDir, `strip-${filledCount}${suffix}.png`));
    }
  }

  console.log(`[generate-pass-assets] Listo: ${outDir}`);
  console.log("  logo.png, logo@2x.png, logo@3x.png");
  console.log(
    `  strip-0.png..strip-${stampsRequired}.png (+ @2x/@3x) — ${(stampsRequired + 1) * 3} archivos de strip`,
  );
}

main().catch((error) => {
  console.error("[generate-pass-assets] Falló:", error);
  process.exit(1);
});
