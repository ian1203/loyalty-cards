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
// fragmentos de letra. Fallback SIN --hero: fila de círculos (rellenos =
// color de marca sólido, vacíos = contorno gris) sobre una banda de fondo
// sólida elegida por CONTRASTE con el color de marca — nunca sello y
// fondo del mismo color ("nada de sello rojo sobre rojo"). CON --hero
// (Sección A3): el mismo lockup transparente se compone en grande sobre
// un fondo de marca (patrón tileado, ver buildTiledHeroCanvas) con los
// sellos en una franja dedicada abajo — ver el porqué en el comentario de
// esa función, un "cover crop" directo del hero no deja margen para los
// sellos sin taparlos. passGeneration.ts elige el archivo correcto según
// min(currentStamps, stampsRequired) — ver deriveStampCountUrl ahí.
//
// Dimensiones storeCard (validadas visualmente en una ronda anterior,
// coherentes con el estándar ampliamente documentado — mismo tamaño que
// coupon/eventTicket): logo se ajusta por ALTURA (50/100/150pt),
// strip 312x123pt @1x (624x246 @2x, 936x369 @3x).
//
// Uso (fallback, círculos sobre blanco):
//   pnpm --filter @loyalty/wallet generate-pass-assets -- \
//     --slug chilaquikes --logo ../../chilaquikes-logo-pass.png \
//     --stamps-required 6 --brand-color DB0A00
// Uso (hero compuesto, Sección A3):
//   pnpm --filter @loyalty/wallet generate-pass-assets -- \
//     --slug chilaquikes --logo ../../chilaquikes-logo-pass.png \
//     --stamps-required 6 --brand-color DB0A00 \
//     --hero ../../chilaquikes/logo-wordmark.png
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "../../..");
const PUBLIC_PASSES_DIR = path.join(REPO_ROOT, "apps/web/public/passes");

const LOGO_BASE_HEIGHT = 50;
// icon.png/@2x/@3x: el ícono de fallback OBLIGATORIO del bundle .pkpass —
// Apple lo usa en notificaciones, Apple Watch y el selector de Siri,
// nunca en la cara del pase (eso es logo.png). 29x29pt, cuadrado exacto
// (a diferencia de logo.png, que se ajusta por altura). El source
// (--logo) ya llega cuadrado y con fondo transparente recortado
// (chilaquikes-logo-pass.png, 660×660 — mismo criterio de "centrado en
// lienzo cuadrado" que ya se usó para logo.png), así que un resize
// directo alcanza — sin crop adicional.
const ICON_BASE_SIZE = 29;
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

// --- Sección A3: modo --hero (logo compuesto + franja de sellos dedicada) ---
// Elegidas en una ronda de verificación visual con renders reales
// (3 variantes de contraste, 2 variantes de layout) — ver la sesión que
// las aprobó. HERO_LOGO_HEIGHT_RATIO prioriza que la franja de sellos se
// lea sin esfuerzo por encima de maximizar el tamaño del logo (Variante 2
// elegida sobre la Variante 1, que dejaba menos aire a los sellos).
const HERO_LOGO_HEIGHT_RATIO = 0.62; // proporción de STRIP_BASE_HEIGHT
const HERO_LOGO_TOP_PT = 14 / 3; // ~4.67pt @1x (14px medidos @3x)
// Alto reservado para el logo compuesto en el strip cuando SÍ se
// compone (sin --no-strip-logo) — HERO_LOGO_TOP_PT + la altura real que
// ocupa a HERO_LOGO_HEIGHT_RATIO. computeIrizStampGrid lo resta del alto
// total ANTES de calcular el grid de sellos, así que nunca compite por el
// mismo espacio que el logo. Con --no-strip-logo (caso real de Iriz hoy:
// el hero ya trae su propio wordmark, no hay logo separado en el strip)
// este valor no se usa — el grid de sellos tiene el strip COMPLETO
// disponible. Ajuste real (ver commit): los dos intentos anteriores de
// este layout heredaban una "banda" de 50pt pensada para 1 fila (mitad
// del strip sin ningún motivo real una vez que dejó de haber logo que
// evitar) — los sellos de 2 filas salían diminutos (~21pt de diámetro) y
// pegados al borde inferior. Sin esa restricción heredada, el grid usa
// el alto real disponible y el diámetro más que se duplica.
const HERO_LOGO_RESERVED_HEIGHT_PT = HERO_LOGO_TOP_PT + HERO_LOGO_HEIGHT_RATIO * STRIP_BASE_HEIGHT;
// Margen vertical del bloque de sellos (1 o 2 filas) dentro del área que
// se le asigna — nunca 0, para que no quede pegado a un borde.
const STAMP_AREA_VERTICAL_MARGIN_PT = 8;
// Ajuste de balance (2 filas) — el intento anterior maximizaba el
// diámetro hasta llenar TODO el alto disponible (~82% del strip),
// dejando el patrón de fondo reducido a un borde mínimo arriba/abajo.
// STAMP_BLOCK_HEIGHT_RATIO fija cuánto del alto del ÁREA asignada ocupa
// el bloque completo (2 filas + separación) — 0.48 deja el patrón
// claramente visible arriba Y abajo del grid (~52% del área), en vez de
// maximizar el diámetro a como dé lugar. STAMP_ROW_GAP_RATIO (separación
// ENTRE filas) es deliberadamente mayor que STAMP_GAP_RATIO (separación
// horizontal, entre sellos de una misma fila) — con el diámetro más
// chico que exige el ratio de arriba, una separación proporcionalmente
// mayor evita que las dos filas se vean pegadas/tocándose.
const STAMP_BLOCK_HEIGHT_RATIO = 0.48;
const STAMP_ROW_GAP_RATIO = 0.5;
const HERO_STAMP_BACKING_FILL = "#FFFFFF"; // disco blanco detrás de cada sello — mismo lenguaje visual que el fondo blanco liso de siempre, solo que individual
const HERO_PATCH_SIZE = 300; // px, muestreado del source del hero a resolución nativa

type Args = {
  slug: string;
  logo: string;
  stampsRequired: number;
  brandColor: string;
  hero?: string;
  heroPatchX: number;
  heroPatchY: number;
  heroCover: boolean;
  noStripLogo: boolean;
  iconFallbackLetter?: string;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const slug = get("--slug");
  const logo = get("--logo");
  const stampsRequiredRaw = get("--stamps-required");
  const brandColorRaw = get("--brand-color");
  const hero = get("--hero");
  // El origen del parche de patrón es específico de CADA imagen de hero —
  // (0,0) funcionó para chilaquikes/logo-wordmark.png (confirmado limpio
  // de logo con un probe visual antes de usarlo) pero no hay garantía de
  // que sirva para el hero de otro negocio; por eso es un flag, no una
  // constante. Verificar visualmente el parche elegido ANTES de generar
  // (ver seam-check en la sesión que validó esto — a este tamaño de patch
  // la costura del tile es visible en zoom aunque no salte a la vista en
  // la composición final; ver ese hallazgo antes de asumir que un patch
  // nuevo sale limpio).
  const heroPatchX = Number.parseInt(get("--hero-patch-x") ?? "0", 10);
  const heroPatchY = Number.parseInt(get("--hero-patch-y") ?? "0", 10);
  // --hero-cover: un solo cover-crop del --hero COMPLETO al tamaño exacto
  // del canvas (sharp fit:"cover", sin tile, sin parche) — para un hero de
  // resolución suficiente que no necesita repetirse. Bug real encontrado
  // en producción (Iriz, primer uso real de --hero): el modo tileado
  // (default) sampleaba un parche de 300px y lo repetía para llenar el
  // ancho, así que en un dispositivo real se veía un mosaico de 3-4 copias
  // en vez de UNA imagen continua (Google Wallet, que sí muestra el hero
  // completo sin tilear, se veía correcto — la discrepancia fue la
  // señal). El --logo SIEMPRE se compone encima (tileado o cover) — usar
  // --hero-cover solo si el --hero es una textura/patrón sin texto propio,
  // nunca uno que ya traiga un wordmark incrustado (se vería duplicado).
  // --hero-patch-x/y no aplican en este modo.
  const heroCover = argv.includes("--hero-cover");
  // --no-strip-logo: el --hero es una textura/patrón con buen contraste
  // propio (ej. cuentas huichol de Iriz) donde componer el wordmark
  // blanco encima queda ilegible (confirmado visualmente — zonas claras
  // del patrón bajan el contraste del texto). El header del pase
  // (logo.png, sobre backgroundColor sólido) ya muestra el wordmark por
  // separado, así que la marca no se pierde sin este overlay en el strip.
  const noStripLogo = argv.includes("--no-strip-logo");
  // Un solo carácter (la letra que va en el círculo de fallback de
  // icon.png) — explícito, no derivado del slug: el slug no siempre
  // arranca con la letra que tiene sentido mostrar (ver CLAUDE.md).
  const iconFallbackLetter = get("--icon-fallback-letter");
  if (!slug || !logo || !stampsRequiredRaw) {
    throw new Error(
      "Uso: --slug <slug> --logo <ruta al PNG transparente> --stamps-required <n> [--brand-color <hex sin #>] [--hero <ruta a la imagen de fondo>] [--hero-patch-x <n>] [--hero-patch-y <n>] [--hero-cover] [--no-strip-logo] [--icon-fallback-letter <letra>]",
    );
  }
  const stampsRequired = Number.parseInt(stampsRequiredRaw, 10);
  if (!Number.isInteger(stampsRequired) || stampsRequired < 1) {
    throw new Error(`--stamps-required inválido: ${stampsRequiredRaw}`);
  }
  // Gris oscuro por default — nunca invisible sobre el fondo blanco del
  // strip si un negocio corre este script sin marca cargada todavía.
  const brandColor = `#${(brandColorRaw ?? "1F1F1F").replace(/^#/, "")}`;
  return {
    slug,
    logo,
    stampsRequired,
    brandColor,
    hero,
    heroPatchX,
    heroPatchY,
    heroCover,
    noStripLogo,
    iconFallbackLetter,
  };
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

type StampPosition = { cx: number; cy: number; diameter: number };

// Grid dinámico de sellos EXCLUSIVO del modo --hero — hoy solo lo invoca
// buildHeroStripAt3x, que a su vez solo corre para negocios que pasan
// --hero (hoy: únicamente Iriz Style). computeStampLayout (arriba) queda
// COMPLETAMENTE intacto y es lo único que usa buildStripSvg (el fallback
// sin --hero, el que sigue usando Chilaquikes en producción) — cero
// riesgo de que este cambio altere su pase.
//
// reservedTopPt: cuánto del alto TOTAL del strip (STRIP_BASE_HEIGHT) NO
// está disponible para sellos porque ya lo ocupa el logo compuesto
// encima (HERO_LOGO_RESERVED_HEIGHT_PT si buildHeroStripAt3x compone
// logo, 0 si --no-strip-logo) — el grid usa TODO lo que sobra, no una
// banda fija heredada del layout de 1 fila. El área asignada es
// [reservedTopPt, STRIP_BASE_HEIGHT], con STAMP_AREA_VERTICAL_MARGIN_PT
// de aire arriba y abajo del bloque para que nunca quede pegado a un
// borde.
//
// Reglas (pedido explícito de Iriz, dejado genérico por si su n cambia):
//   n <= 5           → 1 fila centrada en el área asignada.
//   n >= 6, PAR       → 2 filas iguales (ceil(n/2) == floor(n/2)), grid
//                       regular SIN intercalar — cada columna alineada
//                       verticalmente entre ambas filas.
//   n >= 6, IMPAR     → 2 filas desiguales (arriba = ceil(n/2), abajo =
//                       floor(n/2) = arriba - 1) — la fila de abajo se
//                       intercala en el punto medio horizontal entre
//                       cada par de círculos consecutivos de arriba
//                       (patrón panal), nunca alineada en columna con la
//                       de arriba.
// El diámetro se toma el MÁXIMO que quepa: el mínimo entre lo que permite
// el ancho (fila más ancha) y lo que permite el alto disponible (1 o 2
// filas + separación, dentro del área asignada) — nunca se encoge más de
// lo necesario. Orden de llenado (filledCount): primero la fila de
// arriba completa, izquierda a derecha, después la de abajo — mismo
// criterio de lectura que una tarjeta física de 2 filas.
function computeIrizStampGrid(stampsRequired: number, reservedTopPt: number): StampPosition[] {
  const usableWidth = STRIP_BASE_WIDTH - STRIP_PADDING_X * 2;
  const areaHeight = STRIP_BASE_HEIGHT - reservedTopPt;
  const areaCenterY = reservedTopPt + areaHeight / 2;
  const usableAreaHeight = areaHeight - STAMP_AREA_VERTICAL_MARGIN_PT * 2;

  const rowCenters = (count: number, diameter: number): number[] => {
    const gap = diameter * STAMP_GAP_RATIO;
    const totalWidth = count * diameter + (count - 1) * gap;
    const startX = (STRIP_BASE_WIDTH - totalWidth) / 2;
    return Array.from({ length: count }, (_, i) => startX + diameter / 2 + i * (diameter + gap));
  };

  if (stampsRequired <= 5) {
    const denom = stampsRequired + (stampsRequired - 1) * STAMP_GAP_RATIO;
    const horizontalMax = usableWidth / denom;
    const verticalMax = usableAreaHeight; // 1 sola fila: todo el alto disponible alcanza
    const diameter = Math.min(MAX_STAMP_DIAMETER, horizontalMax, verticalMax);
    return rowCenters(stampsRequired, diameter).map((cx) => ({ cx, cy: areaCenterY, diameter }));
  }

  const topCount = Math.ceil(stampsRequired / 2);
  const bottomCount = Math.floor(stampsRequired / 2);
  const rowsEqual = topCount === bottomCount;

  const horizontalDenom = topCount + (topCount - 1) * STAMP_GAP_RATIO;
  const horizontalMax = usableWidth / horizontalDenom;
  // Diámetro objetivo: el bloque completo (2 filas + separación) debe
  // ocupar STAMP_BLOCK_HEIGHT_RATIO del área asignada, no "lo más grande
  // que quepa" — de ahí despejar el diámetro usando STAMP_ROW_GAP_RATIO
  // (la separación entre filas), nunca STAMP_GAP_RATIO (esa es horizontal,
  // entre sellos de la misma fila). usableAreaHeight/(2+ratio) queda como
  // techo de seguridad (nunca desborda el área con margen), pero en la
  // práctica el ratio de bloque es la restricción real.
  const targetBlockHeight = areaHeight * STAMP_BLOCK_HEIGHT_RATIO;
  const ratioMax = targetBlockHeight / (2 + STAMP_ROW_GAP_RATIO);
  const safetyMax = usableAreaHeight / (2 + STAMP_ROW_GAP_RATIO);
  const diameter = Math.min(MAX_STAMP_DIAMETER, horizontalMax, ratioMax, safetyMax);

  const rowGap = diameter * STAMP_ROW_GAP_RATIO;
  const topRowY = areaCenterY - (diameter + rowGap) / 2;
  const bottomRowY = areaCenterY + (diameter + rowGap) / 2;

  const topCentersX = rowCenters(topCount, diameter);
  const positions: StampPosition[] = topCentersX.map((cx) => ({ cx, cy: topRowY, diameter }));

  if (rowsEqual) {
    for (const cx of topCentersX) {
      positions.push({ cx, cy: bottomRowY, diameter });
    }
  } else {
    // bottomCount === topCount - 1 siempre que stampsRequired sea impar —
    // topCount puntos dejan exactamente topCount-1 huecos entre
    // consecutivos, uno por círculo de abajo.
    for (let i = 0; i < bottomCount; i++) {
      const cx = (topCentersX[i] + topCentersX[i + 1]) / 2;
      positions.push({ cx, cy: bottomRowY, diameter });
    }
  }

  return positions;
}

// Fallback de icon.png cuando el logo real NO aísla limpio a 29x29pt —
// confirmado visualmente (no supuesto): el logo de Chilaquikes trae
// mascota + wordmark + subtítulo en la misma capa, y a 29px real (el
// tamaño @1x que de verdad se usa en notificaciones/Apple Watch, no el
// @3x ampliado) el resultado es una mancha de píxeles ilegible — mismo
// criterio que ya descartó el crop del hero para el strip
// (chilaquikes-emblem-attempt-NOT-USED.png): antes un resultado simple y
// legible que uno "real" pero forzado.
function buildIconFallbackSvg(letter: string, brandColor: string, size: number): string {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${brandColor}" />
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central"
      font-family="Helvetica, Arial, sans-serif" font-weight="700"
      font-size="${size * 0.56}" fill="#FFFFFF">${letter}</text>
  </svg>`;
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

// Arma el strip completo (fondo del --hero, tileado o cover-crop según
// --hero-cover — ver ambos modos abajo) + wordmark opcional (--logo, salvo
// --no-strip-logo) + franja de sellos dedicada abajo. Se arma UNA vez a la
// resolución más alta (@3x) y se re-escala hacia abajo para @2x/@1x — más
// simple y consistente entre escalas que recalcular la composición 3
// veces, y un downscale desde una imagen de mayor resolución no pierde
// nitidez perceptible a estos tamaños.
async function buildHeroStripAt3x(
  heroPath: string,
  logoPath: string,
  patchX: number,
  patchY: number,
  heroCover: boolean,
  noStripLogo: boolean,
  filledCount: number,
  stampsRequired: number,
  brandColor: string,
): Promise<Buffer> {
  const scale = 3;
  const width = STRIP_BASE_WIDTH * scale;
  const height = STRIP_BASE_HEIGHT * scale;

  let background: Buffer;

  if (heroCover) {
    // El --hero es una TEXTURA/patrón (sin wordmark propio) — un solo
    // cover-crop al tamaño exacto del canvas, SIN tile. Bug real
    // encontrado en un dispositivo Apple real (Iriz, hero anterior con
    // wordmark ya compuesto): el modo tileado de abajo repetía un parche
    // de 300px 3-4 veces para llenar el ancho, se veía como mosaico en
    // vez de una imagen continua — Google Wallet (que muestra el hero
    // completo, sin tilear) se veía correcto, esa discrepancia fue la
    // señal de que el problema era el tile, no el asset. sharp
    // fit:"cover" escala por el eje que menos recorte deja y centra el
    // recorte del sobrante.
    background = await sharp(heroPath)
      .resize({ width, height, fit: "cover" })
      .png()
      .toBuffer();
  } else {
    // Modo textura TILEADA (para un --hero de baja resolución o que
    // necesita repetirse para llenar el ancho). Alto del parche = alto
    // TOTAL del canvas (nunca HERO_PATCH_SIZE fijo): bug real corregido —
    // con un parche cuadrado de 300px tileado también en Y, 369px (@3x)
    // no es múltiplo de 300, así que la segunda fila mostraba solo los
    // primeros 69px de una copia nueva del mismo parche — una costura
    // dura. Con el parche ya del alto exacto del canvas, tilesY es
    // siempre 1 — cero costura vertical posible.
    const patchWidth = HERO_PATCH_SIZE;
    const patch = await sharp(heroPath)
      .extract({ left: patchX, top: patchY, width: patchWidth, height })
      .toBuffer();
    const tilesX = Math.ceil(width / patchWidth) + 1;
    const tileComposites: sharp.OverlayOptions[] = [];
    for (let x = 0; x < tilesX; x++) {
      tileComposites.push({ input: patch, left: x * patchWidth, top: 0 });
    }
    background = await sharp({
      create: { width, height, channels: 3, background: brandColor },
    })
      .composite(tileComposites)
      .png()
      .toBuffer();
  }

  // El wordmark (--logo) se compone encima por default (tileado o cover) —
  // --no-strip-logo lo omite cuando el --hero tiene buen contraste propio
  // y componer el wordmark blanco encima queda ilegible en las zonas
  // claras del patrón (confirmado visualmente, ver comentario de
  // --no-strip-logo arriba). El header del pase (logo.png, sobre
  // backgroundColor sólido) sigue mostrando el wordmark siempre, con o
  // sin este flag.
  let logoComposite: sharp.OverlayOptions | null = null;
  if (!noStripLogo) {
    const logoTargetHeight = Math.round(height * HERO_LOGO_HEIGHT_RATIO);
    const logoResized = await sharp(logoPath)
      .resize({ height: logoTargetHeight, fit: "inside" })
      .toBuffer();
    const logoMeta = await sharp(logoResized).metadata();
    const logoLeft = Math.round((width - (logoMeta.width ?? 0)) / 2);
    const logoTop = Math.round(HERO_LOGO_TOP_PT * scale);
    logoComposite = { input: logoResized, left: logoLeft, top: logoTop };
  }

  // computeIrizStampGrid, NO computeStampLayout — ver el comentario de esa
  // función: dinámico a 1 o 2 filas según stampsRequired, exclusivo de
  // este modo (--hero), nunca alcanzado por Chilaquikes (buildStripSvg).
  // reservedTopPt=0 con --no-strip-logo (nada que evitar, todo el strip
  // disponible para sellos) — HERO_LOGO_RESERVED_HEIGHT_PT solo aplica
  // cuando el logo SÍ se compone encima.
  const stampPositions = computeIrizStampGrid(
    stampsRequired,
    noStripLogo ? 0 : HERO_LOGO_RESERVED_HEIGHT_PT,
  );
  const stampParts = stampPositions.map((pos, i) => {
    const cxS = pos.cx * scale;
    const cyS = pos.cy * scale;
    const r = (pos.diameter / 2) * scale;
    const backing = `<circle cx="${cxS}" cy="${cyS}" r="${r}" fill="${HERO_STAMP_BACKING_FILL}" />`;
    const foreground =
      i < filledCount
        ? `<circle cx="${cxS}" cy="${cyS}" r="${r - 3 * scale}" fill="${brandColor}" />`
        : `<circle cx="${cxS}" cy="${cyS}" r="${r - 3 * scale}" fill="none" stroke="${EMPTY_STAMP_STROKE}" stroke-width="${2 * scale}" />`;
    return backing + foreground;
  });
  const stampSvg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${stampParts.join("")}</svg>`,
  );

  return sharp(background)
    .composite([...(logoComposite ? [logoComposite] : []), { input: stampSvg, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function main() {
  const {
    slug,
    logo,
    stampsRequired,
    brandColor,
    hero,
    heroPatchX,
    heroPatchY,
    heroCover,
    noStripLogo,
    iconFallbackLetter,
  } = parseArgs(process.argv.slice(2));
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

  for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
    if (iconFallbackLetter) {
      const svg = buildIconFallbackSvg(iconFallbackLetter, brandColor, ICON_BASE_SIZE * scale);
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outDir, `icon${suffix}.png`));
      continue;
    }
    await sharp(logoPath)
      .resize(ICON_BASE_SIZE * scale, ICON_BASE_SIZE * scale)
      .png()
      .toFile(path.join(outDir, `icon${suffix}.png`));
  }

  // Strip: un archivo por cada conteo posible de sellos (0..stampsRequired,
  // inclusive) — passGeneration.ts elige el correcto en tiempo de
  // generación del .pkpass según el balance real del cliente.
  const heroPath = hero ? path.resolve(process.cwd(), hero) : null;
  for (let filledCount = 0; filledCount <= stampsRequired; filledCount++) {
    if (heroPath) {
      const at3x = await buildHeroStripAt3x(
        heroPath,
        logoPath,
        heroPatchX,
        heroPatchY,
        heroCover,
        noStripLogo,
        filledCount,
        stampsRequired,
        brandColor,
      );
      await sharp(at3x).toFile(path.join(outDir, `strip-${filledCount}@3x.png`));
      await sharp(at3x)
        .resize(STRIP_BASE_WIDTH * 2, STRIP_BASE_HEIGHT * 2)
        .toFile(path.join(outDir, `strip-${filledCount}@2x.png`));
      await sharp(at3x)
        .resize(STRIP_BASE_WIDTH, STRIP_BASE_HEIGHT)
        .toFile(path.join(outDir, `strip-${filledCount}.png`));
      continue;
    }
    for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
      const svg = buildStripSvg(filledCount, stampsRequired, brandColor, scale);
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outDir, `strip-${filledCount}${suffix}.png`));
    }
  }

  console.log(`[generate-pass-assets] Listo: ${outDir}`);
  console.log("  logo.png, logo@2x.png, logo@3x.png");
  console.log("  icon.png, icon@2x.png, icon@3x.png");
  console.log(
    `  strip-0.png..strip-${stampsRequired}.png (+ @2x/@3x) — ${(stampsRequired + 1) * 3} archivos de strip${heroPath ? " (modo --hero)" : ""}`,
  );
}

main().catch((error) => {
  console.error("[generate-pass-assets] Falló:", error);
  process.exit(1);
});
