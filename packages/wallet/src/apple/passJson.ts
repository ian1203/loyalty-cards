// Construye el pass.json — puro, sin I/O. Contenido MÍNIMO a propósito
// (regla de la skill wallet-integration): nombre del negocio, nombre de
// pila del cliente (nunca apellido/teléfono/email), progreso de sellos,
// nombre de la recompensa si hay una disponible. El barcode lleva el
// wallet_token opaco del cliente — el mismo que ya resuelve el scanner,
// nunca datos ni saldos codificados en el propio código de barras.
export type PassJsonInput = {
  serialNumber: string; // wallet_passes.id
  authenticationToken: string;
  webServiceUrl: string;
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string; // nombre del negocio
  programName: string; // nombre del programa de sellos
  customerFirstName: string | null;
  // Progreso del CICLO ACTUAL (currentStamps % stampsRequired, ciclo
  // completo si currentStamps es múltiplo exacto — cycleStampProgress en
  // @loyalty/core, calculado en loyaltySnapshot.ts), NUNCA el total
  // acumulado crudo. Decisión revisada (ver commit): mostrar el total
  // crudo (ej. "8/6") junto a un grid que solo puede representar un ciclo
  // (strip-N.png, ver generate-pass-assets.ts) se leía como inconsistente
  // — confirmado con un render real antes de este cambio. El total
  // crudo sigue existiendo en customer_balances/el dashboard, solo dejó
  // de mostrarse en el pase del cliente.
  cycleStamps: number;
  stampsRequired: number;
  rewardName: string | null;
  // Cuántas reglas de recompensa están desbloqueadas AHORA (no solo la
  // primera/rewardName) — opcional y default 0. Ver la nota de "solo si
  // count > 1" más abajo: con 1 sola, rewardName ya comunica que hay una
  // lista, así que el campo nuevo no aporta información adicional.
  availableRewardsCount?: number;
  walletToken: string; // customers.wallet_token — el barcode
  colors: {
    backgroundRgb: [number, number, number];
    foregroundRgb: [number, number, number];
    labelRgb: [number, number, number];
  };
  // SCAFFOLDING (research/scaffolding, ver skill wallet-integration) — sin
  // consumidor real todavía en apps/web/lib/wallet/passGeneration.ts, así
  // que ningún pase de producción incluye este campo hasta que se cablee
  // a propósito. Hasta 10 ubicaciones (límite documentado de Apple
  // PassKit); relevantText/latitude/longitude van YA CALCULADOS por el
  // caller — buildPassJson sigue sin I/O ni conocer coordenadas de
  // negocio, mismo criterio de siempre. maxDistance es pass-wide (metros,
  // CLLocationDistance), no por ubicación — sin especificarlo, Apple usa
  // un radio implícito (~100 m para storeCard, documentado como "detalle
  // de implementación" que puede cambiar).
  locations?: Array<{
    latitude: number;
    longitude: number;
    altitude?: number;
    relevantText?: string;
  }>;
  maxDistance?: number;
  // Texto del broadcast de promociones más reciente del negocio (ver
  // apps/web/app/(product)/promotions/logic.ts) — null si el negocio
  // nunca envió uno (nunca un placeholder inventado, mismo criterio que
  // el resto de campos opcionales de este archivo). Cuando está presente
  // se agrega a backFields CON changeMessage: cambiar el VALOR de un
  // campo que ya tiene changeMessage es lo que dispara el banner de lock
  // screen vía el mismo pipeline de push vacío que ya usa
  // notifyWalletOfTransaction (ver apple/apns.ts) — Apple sustituye "%@"
  // por el valor nuevo. El primer envío de un negocio agrega el campo
  // por primera vez (no es "cambio de valor" en sentido estricto), así
  // que no hay garantía de banner esa primera vez — sí a partir del
  // segundo envío en adelante (pendiente de confirmar contra un
  // dispositivo real, ver plan).
  promoMessage?: string | null;
  // Contenido informativo ESTÁTICO por negocio (no cambia con cada
  // transacción, a diferencia de promoMessage arriba) — hoy solo lo
  // provee la config de código en apps/web/lib/wallet/passBackFieldsConfig.ts
  // (Chilaquikes), ver skill wallet-integration. Cada uno agrega UNA
  // entrada condicional a backFields; ausente (undefined) para cualquier
  // negocio sin config — nunca un placeholder inventado.
  howItWorksText?: string;
  howToEarnStampText?: string;
  validUntilText?: string;
  // reviewLinkUrl sin reviewLinkLabel usa "Dejar reseña" como texto de
  // respaldo — reviewLinkLabel solo sin reviewLinkUrl no agrega nada (un
  // link sin URL no es tappable, así que no vale la pena el campo).
  reviewLinkUrl?: string;
  reviewLinkLabel?: string;
  createdWithUrl?: string;
  createdWithLabel?: string;
  // Activa 3 backFields dinámicos DE CUENTA (total histórico, faltantes
  // para la próxima recompensa, disponibles) juntos — sin flag, ninguno
  // se agrega, ni siquiera "Disponible" pese a que availableRewardsCount
  // (arriba) siempre está presente. Ver apps/web/lib/wallet/
  // passBackFieldsConfig.ts (showAccountSummaryFields).
  showAccountSummaryFields?: boolean;
  // Total HISTÓRICO de sellos ganados (nunca decrece con un canje) —
  // DISTINTO de cycleStamps/headerFields arriba, que sí puede "reiniciar"
  // visualmente cada ciclo. Ver loyaltySnapshot.ts (COUNT sobre
  // transactions).
  totalStampsEarned?: number;
  // null cuando no hay ninguna recompensa pendiente (ya puede canjear
  // todas, o el negocio no tiene reglas activas) — en ese caso el campo
  // completo se omite, no se muestra "0".
  stampsUntilNextReward?: number | null;
  // Nombre de la PRIMERA regla de recompensa del programa (loyaltySnapshot.ts,
  // rules[0]?.name) — a diferencia de rewardName (arriba, solo cuando YA
  // está disponible), este vive SIEMPRE que el negocio tenga al menos una
  // regla activa, disponible o no. Ocupa el slot de secondaryFields que
  // dejó libre "Powered by Pragmia" (ver altText del barcode más abajo) —
  // null cuando el negocio no tiene ninguna regla configurada, nunca un
  // placeholder inventado.
  nextRewardName?: string | null;
};

// Texto del banner de lock screen al entrar en el geofence de una
// ubicación — mismo tono/casos que buildProgressMessage (Google,
// loyaltyPayload.ts): sellos restantes, singular vs. plural, y el caso
// especial de ciclo completo. Duplicado a propósito, no importado desde
// google/ — cada plataforma mantiene su builder de mensajes desacoplado
// (mismo criterio que separa apple/ de google/ en todo lo demás), aunque
// el texto resultante sea equivalente hoy. customerFirstName es EL MISMO
// campo ya derivado en loyaltySnapshot.ts (customers.fullName.split(" ")[0])
// que ya usa Apple en secondaryFields ("Cliente") y Google en accountName
// — nunca una query nueva. Null cuando el cliente no tiene fullName
// (defensivo — hoy tanto /enroll como el alta manual lo exigen, pero el
// campo sigue siendo nullable en el esquema): sin nombre, cae al texto
// genérico, nunca "null, te faltan...".
export function buildRelevantText(
  cycleStamps: number,
  stampsRequired: number,
  rewardName: string,
  customerFirstName?: string | null,
): string {
  const remaining = stampsRequired - cycleStamps;
  const body =
    remaining <= 0
      ? `ya puedes canjear tu ${rewardName}`
      : remaining === 1
        ? `solo te falta 1 sello para tu ${rewardName}`
        : `te faltan ${remaining} sellos para tu ${rewardName}`;

  // Con nombre: "¡Carlo, te faltan 2 sellos...!" (minúscula tras la coma,
  // flujo natural de saludo). Sin nombre: "¡Te faltan 2 sellos...!"
  // (mayúscula al inicio de la oración, sin cambiar el tono ya usado en
  // el resto del pase).
  if (customerFirstName) {
    return `¡${customerFirstName}, ${body}!`;
  }
  return `¡${body.charAt(0).toUpperCase()}${body.slice(1)}!`;
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function buildPassJson(input: PassJsonInput): Record<string, unknown> {
  // Siempre visible, incluso en la vista apilada de Wallet (antes de tocar
  // el pase) — a diferencia de primaryFields/el strip, que solo se ven al
  // expandirlo. Un solo headerField a propósito: Wallet reserva poco
  // espacio en esa esquina, un segundo campo ahí se trunca o empuja al
  // primero.
  const headerFields = [
    {
      key: "stampsHeader",
      label: "SELLOS",
      value: `${input.cycleStamps}/${input.stampsRequired}`,
    },
  ];

  // primaryFields queda VACÍO a propósito (Opción A, decisión post-bug real
  // en dispositivo): para storeCard, PassKit renderiza primaryFields
  // SUPERPUESTO sobre la imagen del strip (no debajo, como una sección
  // aparte) — no es configurable desde pass.json (sin control de
  // posición/tamaño). Con el strip nuevo (hero compuesto, ver
  // generate-pass-assets.ts modo --hero), ese texto tapaba la cara del
  // mascot y parte del wordmark en un dispositivo real. headerFields ya
  // cubre "SELLOS X/Y" siempre visible (incluso en la vista apilada) sin
  // superponerse a nada — se prefirió eliminar el campo entero antes que
  // adivinar una zona "segura" en el strip, porque no hay forma de saber
  // con certeza dónde PassKit lo posiciona (varía con accesibilidad/
  // tamaño de texto dinámico del dispositivo).
  const primaryFields: Array<{ key: string; label: string; value: string }> = [];

  const availableRewardsCount = input.availableRewardsCount ?? 0;
  // Último slot de secondaryFields: "Recompensas disponibles", SOLO con
  // MÁS DE UNA desbloqueada (con exactamente 1, auxiliaryFields ya
  // muestra su nombre, ver abajo — repetirlo acá sería la misma
  // redundancia que ya se evitó en otros campos); "Siguiente recompensa"
  // (nextRewardName) el resto del tiempo — pedido explícito de llenar el
  // espacio que dejó libre "Powered by Pragmia" al mudarse al altText del
  // barcode (más abajo). Mutuamente excluyentes, igual que antes: nunca
  // conviven en el mismo slot. Sin ninguna regla de recompensa configurada
  // (nextRewardName null), el campo se omite — nunca un placeholder
  // inventado.
  const secondaryFields = [
    ...(input.customerFirstName
      ? [{ key: "customer", label: "Cliente", value: input.customerFirstName }]
      : []),
    ...(availableRewardsCount > 1
      ? [{ key: "rewardsAvailable", label: "Recompensas disponibles", value: String(availableRewardsCount) }]
      : input.nextRewardName
        ? [{ key: "nextReward", label: "Siguiente recompensa", value: input.nextRewardName }]
        : []),
  ];

  // "Powered by Pragmia" vive SIEMPRE en backFields ahora (ver
  // storeCard.backFields abajo) — decisión revisada: el estado
  // "recompensa disponible" puede persistir indefinidamente (el cliente
  // sigue acumulando sellos tras desbloquear la primera recompensa, no
  // resetea), así que ya no existe un momento confiable en el que
  // auxiliaryFields esté "libre" para poweredBy. auxiliaryFields queda
  // dedicado por completo a la recompensa, sin competir por espacio con
  // ningún otro campo, en cualquier estado.
  const auxiliaryFields = input.rewardName
    ? [{ key: "reward", label: "Recompensa disponible", value: input.rewardName }]
    : [];

  return {
    formatVersion: 1,
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber: input.serialNumber,
    teamIdentifier: input.teamIdentifier,
    organizationName: input.organizationName,
    description: input.programName,
    webServiceURL: input.webServiceUrl,
    authenticationToken: input.authenticationToken,
    backgroundColor: rgb(input.colors.backgroundRgb),
    foregroundColor: rgb(input.colors.foregroundRgb),
    labelColor: rgb(input.colors.labelRgb),
    storeCard: {
      headerFields,
      primaryFields,
      secondaryFields,
      auxiliaryFields,
      // Incondicional (ver la nota de arriba en auxiliaryFields) — el
      // único contenido que backFields ha tenido alguna vez es este
      // mismo campo, así que no queda ningún otro huérfano al fijarlo
      // siempre acá. Accesible al tocar el ícono de info, nunca al
      // frente — un solo lugar, sin depender de ningún estado.
      backFields: [
        { key: "poweredBy", label: "", value: "Powered by Pragmia" },
        ...(input.promoMessage
          ? [
              {
                key: "promo",
                label: "Última promoción",
                value: input.promoMessage,
                changeMessage: "%@",
              },
            ]
          : []),
        ...(input.showAccountSummaryFields
          ? [
              {
                key: "totalStampsEarned",
                label: "Total acumulado",
                value: `${input.totalStampsEarned ?? 0} sellos`,
              },
              ...(input.stampsUntilNextReward != null
                ? [
                    {
                      key: "stampsUntilNextReward",
                      label: "Para la siguiente recompensa",
                      value: `${input.stampsUntilNextReward} sello${input.stampsUntilNextReward === 1 ? "" : "s"}`,
                    },
                  ]
                : []),
              {
                key: "availableRewards",
                label: "Disponible",
                value: String(input.availableRewardsCount ?? 0),
              },
            ]
          : []),
        ...(input.howItWorksText
          ? [{ key: "howItWorks", label: "Cómo funciona", value: input.howItWorksText }]
          : []),
        ...(input.howToEarnStampText
          ? [{ key: "howToEarnStamp", label: "Cómo conseguir un sello", value: input.howToEarnStampText }]
          : []),
        // attributedValue: link tappable (Apple PKField, sin entitlement
        // especial) — value queda como respaldo en texto plano para
        // versiones viejas de iOS que no lo rendericen.
        ...(input.reviewLinkUrl
          ? [
              {
                key: "review",
                label: "Reseña",
                value: input.reviewLinkLabel ?? "Dejar reseña",
                attributedValue: `<a href='${input.reviewLinkUrl}'>${input.reviewLinkLabel ?? "Dejar reseña"}</a>`,
              },
            ]
          : []),
        ...(input.validUntilText
          ? [{ key: "validUntil", label: "La tarjeta es válida hasta", value: input.validUntilText }]
          : []),
        ...(input.createdWithUrl
          ? [
              {
                key: "createdWith",
                label: "Creado con",
                value: input.createdWithLabel ?? "Pragmia",
                attributedValue: `<a href='${input.createdWithUrl}'>${input.createdWithLabel ?? "Pragmia"}</a>`,
              },
            ]
          : []),
      ],
    },
    barcodes: [
      {
        message: input.walletToken,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
        // Texto fijo bajo el código de barras — reemplaza el slot de
        // secondaryFields que "Powered by Pragmia" ocupaba antes (ver
        // comentario ahí arriba). Nunca cambia con el estado del pase,
        // así que vivir en altText (en vez de un campo real) no le quita
        // visibilidad ni compite por espacio con datos del cliente.
        altText: "Powered by Pragmia",
      },
    ],
    ...(input.locations?.length
      ? {
          locations: input.locations,
          ...(input.maxDistance !== undefined ? { maxDistance: input.maxDistance } : {}),
        }
      : {}),
  };
}
