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
  currentStamps: number;
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
};

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
      value: `${input.currentStamps}/${input.stampsRequired}`,
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
  const secondaryFields = [
    ...(input.customerFirstName
      ? [{ key: "customer", label: "Cliente", value: input.customerFirstName }]
      : []),
    // Solo con MÁS DE UNA recompensa desbloqueada — con exactamente 1,
    // auxiliaryFields ya muestra su nombre (ver abajo), así que un
    // "Recompensas disponibles: 1" ahí sería la misma redundancia que ya
    // se evitó en otros campos de este pase.
    ...(availableRewardsCount > 1
      ? [{ key: "rewardsAvailable", label: "Recompensas disponibles", value: String(availableRewardsCount) }]
      : []),
  ];

  // "Powered by Pragmia" al FRENTE (auxiliaryFields) por default — texto
  // real del pase, con la fuente nativa de Wallet, no horneado en el
  // strip. Solo cuando ya hay recompensa disponible, auxiliaryFields ya
  // tiene el campo "reward" (que puede llevar un nombre largo, ej. "Orden
  // de chilaquiles gratis") — meter poweredBy ahí forzaría a Wallet a
  // partir la fila en dos mitades y truncar justo el mensaje que más
  // importa en ese momento. En ese caso (y SOLO en ese caso) poweredBy
  // cede el lugar y se queda en el back, como antes.
  const auxiliaryFields = input.rewardName
    ? [{ key: "reward", label: "Recompensa disponible", value: input.rewardName }]
    : [{ key: "poweredBy", label: "", value: "Powered by Pragmia" }];

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
      // Contraparte de la nota de arriba: cuando poweredBy cedió su lugar
      // al frente (recompensa disponible), sigue siendo accesible al
      // tocar el ícono de info — nunca desaparece del todo, solo cambia
      // de cara. Sin recompensa disponible, ya está al frente y el back
      // no lo repite (sería redundante).
      backFields: input.rewardName ? [{ key: "poweredBy", label: "", value: "Powered by Pragmia" }] : [],
    },
    barcodes: [
      {
        message: input.walletToken,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
      },
    ],
  };
}
