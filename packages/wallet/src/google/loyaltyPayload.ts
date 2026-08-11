import type { RgbColor } from "../apple/placeholderIcon";

// Construye los payloads de Loyalty Class (por negocio) y Loyalty Object
// (por cliente) — puro, sin I/O, mismo espíritu que apple/passJson.ts:
// contenido MÍNIMO, nunca teléfono/email/apellido. El barcode lleva el
// mismo wallet_token opaco que Apple. classId/objectId se DERIVAN
// determinísticamente del issuerId+businessId/customerId (ver skill
// wallet-integration) — no se guardan en el esquema.

// Versión activa de la Loyalty Class de Google para TODO negocio nuevo —
// sufijo determinístico, nunca una fila nueva en businesses (evita una
// migración de esquema para lo que es, en esencia, una constante de
// código). Bump manual cuando el diseño de la clase cambie de nuevo
// (quitar el hero fue el motivo de _v2 — ver
// scripts/migrate-google-class-v2.ts; volver a agregar un hero —esta vez
// el patrón de mini-mascots, no la foto de producto que se veía fuera de
// lugar— es el motivo de _v3, ver scripts/migrate-google-class-v3.ts;
// classTemplateInfo para mostrar accountName en la CARA de la tarjeta —a
// diferencia de Apple, donde "Cliente"/nombre ya vive en secondaryFields
// del storeCard por defecto, Google solo lo pone en el panel de
// detalles salvo que se declare explícito vía cardTemplateOverride— es
// el motivo de _v4, ver scripts/migrate-google-class-v4.ts; programName
// vuelve a ser el nombre real del programa de Chilaquikes ("Club de la
// Gorrita", restaurado en loyalty_programs.name — el genérico "Tarjeta de
// sellos Chilaquikes" nunca fue el nombre real, quedó puesto a mano en
// _v2/_v3/_v4 sin que nadie lo hubiera pedido así) — es el motivo de _v5,
// ver scripts/migrate-google-class-v5.ts; merchantLocations activado con
// las 3 coordenadas reales de Chilaquikes — es el motivo de _v6, ver
// scripts/migrate-google-class-v6.ts):
// Google cachea agresivamente por classId, así que un cambio de campos
// visuales SIEMPRE necesita un classId nuevo, nunca un PATCH in-place de
// la clase vieja.
export const CURRENT_GOOGLE_LOYALTY_CLASS_VERSION = "v6";

export function buildLoyaltyClassId(issuerId: string, businessId: string, version?: string): string {
  const suffix = version ? `_${version}` : "";
  return `${issuerId}.biz_${businessId}${suffix}`;
}

export function buildLoyaltyObjectId(issuerId: string, customerId: string): string {
  return `${issuerId}.pass_${customerId}`;
}

function toHex([r, g, b]: RgbColor): string {
  const channel = (n: number) => n.toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function imageAsset(uri: string, description: string): Record<string, unknown> {
  return {
    sourceUri: { uri },
    contentDescription: { defaultValue: { language: "es-MX", value: description } },
  };
}

export type LoyaltyClassInput = {
  issuerId: string;
  businessId: string;
  businessName: string;
  programName: string;
  backgroundRgb: RgbColor;
  // URLs públicas HTTPS — Google Wallet las va a buscar por su cuenta al
  // renderizar la clase, no acepta un archivo local ni un data-URI.
  // Opcionales: sin ellas, la clase queda sin esa pieza (nunca un
  // placeholder fantasma que confunda con los sellos).
  programLogoUri?: string;
  // Variante ancha del logo (banner en vez de ícono circular) — solo vale
  // la pena mandarla si existe un asset realmente diseñado para ese
  // formato; Google la estira si le das el mismo logo cuadrado que
  // programLogo, y se ve peor que no mandar nada.
  wideProgramLogoUri?: string;
  // Imagen grande en la parte superior de la tarjeta — el único lugar del
  // diseño de Google Wallet con espacio para una foto real del producto
  // (Google no soporta una rejilla gráfica de sellos, a diferencia de
  // Apple Wallet).
  heroImageUri?: string;
  // Sufijo determinístico (ver CURRENT_GOOGLE_LOYALTY_CLASS_VERSION) — sin
  // esto, el id sale igual que antes (compatibilidad hacia atrás para
  // callers/tests que no versionan todavía).
  classVersion?: string;
  // SCAFFOLDING (research/scaffolding, ver skill wallet-integration) — sin
  // consumidor real todavía en apps/web/lib/wallet/googleSaveLink.ts/
  // notify.ts, así que ninguna clase de producción incluye este campo
  // hasta que se cablee a propósito (y eso exige un classId nuevo, mismo
  // criterio que heroImageUri/classTemplateInfo: es un campo de la Loyalty
  // Class, Google cachea por classId). A diferencia de locations de Apple,
  // MerchantLocation solo trae latitude/longitude — el texto de la
  // notificación lo arma Google del lado suyo, no es personalizable (sin
  // relevantText ni campo equivalente en el schema).
  merchantLocations?: Array<{ latitude: number; longitude: number }>;
};

export function buildLoyaltyClassPayload(input: LoyaltyClassInput): Record<string, unknown> {
  return {
    id: buildLoyaltyClassId(input.issuerId, input.businessId, input.classVersion),
    issuerName: input.businessName,
    programName: input.programName,
    // "UNDER_REVIEW" (SCREAMING_SNAKE_CASE — verificado contra la API
    // real: un POST con "APPROVED" lo rechaza con 400, "Invalid review
    // status \"APPROVED\". Use \"UNDER_REVIEW\" instead" — el issuer NO
    // puede autodeclararse aprobado vía este campo; ese valor lo pone
    // Google después de su propia revisión, nunca el emisor). El código
    // anterior tenía "underReview" en camelCase, que nunca se validó
    // contra la API real (solo se probó vía el link "Add to Wallet",
    // que embebe la clase en el JWT sin pasar por esta validación
    // estricta) — la marca "[TEST ONLY]" no depende de este campo: la
    // controla el estatus de aprobación de PUBLICACIÓN de la cuenta
    // emisora (trámite externo, ver docs/WALLET-SETUP.md), no algo que
    // este payload declare.
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: toHex(input.backgroundRgb),
    ...(input.programLogoUri
      ? { programLogo: imageAsset(input.programLogoUri, `Logo de ${input.businessName}`) }
      : {}),
    ...(input.wideProgramLogoUri
      ? { wideProgramLogo: imageAsset(input.wideProgramLogoUri, `Logo de ${input.businessName}`) }
      : {}),
    ...(input.heroImageUri
      ? { heroImage: imageAsset(input.heroImageUri, input.businessName) }
      : {}),
    ...(input.merchantLocations?.length ? { merchantLocations: input.merchantLocations } : {}),
    // Sin esto, accountName (ya poblado en el Loyalty Object — ver abajo)
    // solo aparece en el panel de detalles al tocar el pase, nunca en la
    // cara visible de la tarjeta — a diferencia de Apple, donde
    // secondaryFields SÍ vive en la cara por defecto sin configuración
    // extra. Confirmado contra la documentación oficial de Google
    // (Customize Google Wallet Passes — Loyalty cards): una fila con
    // fieldPath "object.accountName" en cardRowTemplateInfos la saca a la
    // cara. oneItem (una sola columna) porque es el único dato que
    // queremos ahí — no hay un segundo campo con el que emparejarlo.
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            oneItem: {
              item: {
                firstValue: {
                  fields: [{ fieldPath: "object.accountName" }],
                },
              },
            },
          },
        ],
      },
    },
  };
}

export type LoyaltyObjectInput = {
  issuerId: string;
  businessId: string;
  customerId: string;
  customerFirstName: string | null;
  stampsRequired: number;
  // Progreso del CICLO ACTUAL (currentStamps % stampsRequired, ciclo
  // completo si currentStamps es múltiplo exacto — ver cycleStampProgress
  // en @loyalty/core, calculado en loyaltySnapshot.ts) — usado tanto en
  // loyaltyPoints.balance (el número siempre visible) como en
  // buildProgressMessage ("cuánto falta"), NUNCA el total acumulado
  // crudo. Decisión revisada (ver commit): mostrar "8 / 6" en el balance
  // junto a un mensaje de progreso ya cycle-aware se leía inconsistente
  // — confirmado con un render real antes de este cambio. El total
  // crudo sigue existiendo en customer_balances/el dashboard, solo dejó
  // de mostrarse en el pase del cliente.
  cycleStamps: number;
  rewardName: string | null;
  walletToken: string;
  // Cuántas reglas de recompensa están desbloqueadas AHORA (no solo la
  // primera/rewardName) — opcional y default 0 a propósito: la mayoría de
  // los negocios define una sola recompensa, y en ese caso count nunca
  // pasa de 1 (ver la nota de "solo si count > 1" en
  // buildLoyaltyObjectPayload, evita duplicar la señal que rewardName ya
  // da).
  availableRewardsCount?: number;
  // Debe coincidir con el classVersion usado para armar el classId de esa
  // misma clase (ver LoyaltyClassInput.classVersion) — si no coinciden, el
  // objeto queda apuntando a un classId que no existe.
  classVersion?: string;
};

// Google Wallet no soporta una rejilla gráfica de sellos (a diferencia de
// Apple Wallet) — el ÚNICO lugar para comunicar avance es texto. Un
// "4 / 6" seco en loyaltyPoints.balance no motiva a volver; este mensaje
// vive aparte, en textModulesData, con el nombre real de la recompensa y
// cuánto falta (o la confirmación de que ya está lista).
//
// Deliberadamente NO repite "X de Y sellos": ese número YA lo muestra
// loyaltyPoints.balance, siempre visible arriba de este texto en la
// plantilla fija de Google Wallet (el orden de campos en el JSON no
// controla el layout — Google decide esa jerarquía, no nosotros). Repetir
// el conteo acá era la redundancia real que había que arreglar.
//
// Recibe cycleStamps (progreso del ciclo actual, YA acotado a
// [0, stampsRequired] por cycleStampProgress en @loyalty/core), nunca el
// total acumulado crudo — bug real corregido: con el total crudo, un
// cliente con 8 sellos y límite 6 leía "¡Ya puedes canjear!" para
// siempre, sin ninguna señal de que ya lleva 2 sellos de un segundo
// ciclo. packages/wallet no depende de @loyalty/core (paquete aislado a
// propósito) — el cálculo del módulo vive en loyaltySnapshot.ts, acá
// solo se consume el resultado ya listo.
export function buildProgressMessage(
  cycleStamps: number,
  stampsRequired: number,
  rewardName: string,
): string {
  const remaining = Math.max(stampsRequired - cycleStamps, 0);
  if (remaining === 0) {
    return `¡Ya puedes canjear tu ${rewardName}!`;
  }
  if (remaining === 1) {
    return `¡Solo te falta 1 sello para tu ${rewardName}!`;
  }
  return `¡Te faltan ${remaining} sellos para tu ${rewardName}!`;
}

// Texto de la notificación PUSH real (loyaltyobject.addMessage,
// TEXT_AND_NOTIFY) — deliberadamente una función DISTINTA de
// buildProgressMessage: esa alimenta textModulesData, el texto SIEMPRE
// visible del pase, ya en producción para todo cliente real; esta es
// scaffolding sin caller real todavía (ver notify.ts), mismo criterio de
// "no tocar lo que ya está en vivo" que separó apple/passJson.ts. Mismo
// tono/casos que buildRelevantText (Apple) — duplicado a propósito,
// plataformas desacopladas, aunque el texto resultante sea equivalente.
export function buildNotificationMessage(
  cycleStamps: number,
  stampsRequired: number,
  rewardName: string,
  customerFirstName?: string | null,
): string {
  const remaining = Math.max(stampsRequired - cycleStamps, 0);
  const body =
    remaining === 0
      ? `ya puedes canjear tu ${rewardName}`
      : remaining === 1
        ? `solo te falta 1 sello para tu ${rewardName}`
        : `te faltan ${remaining} sellos para tu ${rewardName}`;

  if (customerFirstName) {
    return `¡${customerFirstName}, ${body}!`;
  }
  return `¡${body.charAt(0).toUpperCase()}${body.slice(1)}!`;
}

export function buildLoyaltyObjectPayload(input: LoyaltyObjectInput): Record<string, unknown> {
  const availableRewardsCount = input.availableRewardsCount ?? 0;
  const textModulesData = [
    ...(input.rewardName
      ? [
          {
            id: "progress",
            header: "Tu progreso",
            body: buildProgressMessage(input.cycleStamps, input.stampsRequired, input.rewardName),
          },
        ]
      : []),
    // Solo con MÁS DE UNA recompensa desbloqueada: con exactamente 1, el
    // mensaje de "progress" de arriba (o rewardName en Apple) ya avisa que
    // hay una lista para canjear — repetir "Recompensas disponibles: 1"
    // sería la misma redundancia que ya se evitó con "X de Y sellos" (ver
    // el comentario de buildProgressMessage). Con 2+, si hay valor real:
    // el cliente no sabría por otro medio que hay más de una esperando.
    ...(availableRewardsCount > 1
      ? [
          {
            id: "rewardsAvailable",
            header: "Recompensas disponibles",
            body: String(availableRewardsCount),
          },
        ]
      : []),
    // Sin condición de recompensa — a diferencia de Apple (donde
    // poweredBy cede su lugar en auxiliaryFields cuando hay recompensa,
    // ver apple/passJson.ts), Google no tiene un layout de campos fijos
    // que se pueda "llenar": textModulesData es una lista que Wallet
    // apila verticalmente sin límite de espacio horizontal, así que no
    // hay ningún truncamiento que evitar acá.
    { id: "poweredBy", header: "", body: "Powered by Pragmia" },
  ];

  return {
    id: buildLoyaltyObjectId(input.issuerId, input.customerId),
    classId: buildLoyaltyClassId(input.issuerId, input.businessId, input.classVersion),
    state: "active",
    ...(input.customerFirstName ? { accountName: input.customerFirstName } : {}),
    loyaltyPoints: {
      label: "Sellos",
      balance: { string: `${input.cycleStamps} / ${input.stampsRequired}` },
    },
    textModulesData,
    barcode: { type: "QR_CODE", value: input.walletToken },
  };
}
