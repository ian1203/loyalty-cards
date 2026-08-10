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
  const primaryFields = [
    {
      key: "stamps",
      label: "Sellos",
      value: `${input.currentStamps} de ${input.stampsRequired}`,
    },
  ];

  const secondaryFields = input.customerFirstName
    ? [{ key: "customer", label: "Cliente", value: input.customerFirstName }]
    : [];

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
