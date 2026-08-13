// Fuente única de copy tipado para la landing pública de marketing
// (apps/web/app/(marketing)/**). El contenido original vive en
// /wallet-bi-plans.md (raíz del repo) — este módulo es su traducción a TS,
// para que editar precios o texto no obligue a tocar JSX. Nombre de marca
// ya actualizado a "Pragmia" (el .md fuente sigue diciendo "Wallet BI",
// es el borrador original, no se edita).
//
// Nada de esto toca datos de tenant: es contenido estático, el mismo para
// cualquier visitante.

export const BRAND = {
  name: "Pragmia",
  category: "Plataforma de lealtad e inteligencia de retención",
  location: "Veracruz, México",
} as const;

export const HERO = {
  headline: "Crea tu programa. Registra cada visita. Haz que tus clientes regresen.",
  subhead:
    "Tarjetas digitales, sellos y promociones en Apple Wallet y Google Wallet, con analítica para entender y recuperar clientes.",
  ctaDemoLabel: "Agenda una demo",
  ctaLoginLabel: "¿Ya eres cliente? Inicia sesión",
} as const;

export const PROBLEM_POINTS: string[] = [
  "Dependen de tarjetas físicas que se pierden o se olvidan.",
  "Lanzan descuentos sin saber quién los utilizó.",
  "No identifican a sus clientes frecuentes, VIP o inactivos.",
  "No saben qué promoción generó una nueva visita.",
  "Guardan datos de clientes, pero no los convierten en acciones.",
  "No quieren obligar al consumidor a descargar una app.",
];

export type HowItWorksStep = {
  step: number;
  title: string;
  description: string;
  comingSoon?: boolean;
};

// Antes tenía un 6to paso ("Recomendaciones", comingSoon) — se quitó
// entero (no solo el badge): Pragmia todavía no recomienda ninguna acción,
// y el visitante de "Cómo funciona" quiere ver lo que el producto hace
// hoy, no el roadmap (mismo criterio que la auditoría de la tabla de
// comparación).
export const HOW_IT_WORKS: HowItWorksStep[] = [
  { step: 1, title: "Alta", description: "El cliente se registra: escanea un QR o abre un enlace." },
  { step: 2, title: "Wallet", description: "Agrega su tarjeta a Apple Wallet o Google Wallet." },
  { step: 3, title: "Visitas", description: "Acumula beneficios (sellos por visita; puntos según mecánica)." },
  { step: 4, title: "Promociones", description: "Recibe promociones directamente en su tarjeta." },
  { step: 5, title: "Medición", description: "El negocio mide altas, visitas, recompensas y redenciones." },
];

export type PromoType = { name: string; description: string; comingSoon?: boolean };

export const PROMO_TYPES: PromoType[] = [
  {
    name: "Promoción visible",
    description: "Oferta en la tarjeta por un periodo (ej. 2×1 los martes).",
  },
  {
    name: "Recompensa",
    description: "Al cumplir una meta (ej. café gratis con 10 sellos).",
  },
  {
    name: "Cupón individual",
    description: "Beneficio personal de un solo uso, con vigencia y estado (ej. $50 para recuperar a un cliente).",
    comingSoon: true,
  },
];

export const IVA_LABEL = "+ IVA";

export type Plan = {
  id: "basico" | "negocio" | "intelligence";
  name: string;
  monthly: number;
  annual: number;
  annualSavings: number;
  activation: number;
  idealFor: string;
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "basico",
    name: "Básico",
    monthly: 500,
    annual: 5000,
    annualSavings: 1000,
    activation: 2500,
    idealFor: "Sustituir la tarjeta física.",
  },
  {
    id: "negocio",
    name: "Negocio",
    monthly: 700,
    annual: 7000,
    annualSavings: 1400,
    activation: 3000,
    idealFor: "Administrar campañas y medir recurrencia.",
    popular: true,
  },
  {
    id: "intelligence",
    name: "Intelligence",
    monthly: 1000,
    annual: 10000,
    annualSavings: 2000,
    activation: 3000,
    idealFor: "Segmentación, automatización y recomendaciones.",
  },
];

export const ANNUAL_TERMS = "Paga 10 meses, recibe 12. La activación se cobra siempre por separado, sin descuento.";

export const ACTIVATION_INCLUDES: string[] = [
  "Reunión inicial y definición de mecánica",
  "Personalización visual de la tarjeta",
  "Configuración del negocio y sus puntos de venta",
  "Configuración inicial de sellos/recompensas/promoción",
  "Creación de QR/enlaces",
  "Pruebas",
  "Capacitación al responsable",
  "Material básico y acompañamiento en el lanzamiento",
];

export type ComparisonRow = {
  feature: string;
  basico: string;
  negocio: string;
  intelligence: string;
  // "value": texto/número libre, se muestra tal cual. "boolean": el valor
  // es literalmente "Sí"/"No" y ComparisonMatrix lo reemplaza por un ícono
  // check/x — nunca uses "boolean" con un valor que no sea exactamente
  // "Sí" o "No" (ej. "Básica"/"Completa" es "value", no "boolean").
  kind: "value" | "boolean";
  // Sub-lista opcional que ComparisonMatrix despliega bajo el nombre de la
  // fila (patrón <details> nativo, igual que el toggle de la tabla
  // completa) — agrupa varias métricas puntuales bajo una sola fila en vez
  // de una fila por métrica.
  details?: string[];
};

// Auditado 2026-08-11 contra el código real (no contra el plan original) —
// toda fila "Próximamente" que no tenía una implementación real detrás se
// eliminó (el visitante quiere saber qué obtiene el día 1, no el roadmap).
// Filas agrupadas: primero valores (precio, cantidades), después
// características Sí/No.
export const COMPARISON_MATRIX: ComparisonRow[] = [
  // --- Valores ---
  { feature: "Precio mensual", basico: "$500", negocio: "$700", intelligence: "$1,000", kind: "value" },
  { feature: "Puntos de venta", basico: "1", negocio: "Hasta 3", intelligence: "Hasta 5", kind: "value" },
  {
    feature: "Promociones visibles simultáneas",
    basico: "1",
    negocio: "Hasta 3",
    intelligence: "Sin límite*",
    kind: "value",
  },
  {
    feature: "Administración de promociones",
    basico: "1 cambio/mes por solicitud",
    negocio: "Desde plataforma",
    intelligence: "Desde plataforma",
    kind: "value",
  },
  {
    feature: "Comparación entre sucursales",
    basico: "No",
    negocio: "Básica",
    intelligence: "Completa",
    kind: "value",
  },
  // --- Características (Sí/No) ---
  // "Apple/Google Wallet" se quitó a propósito: ya se comunica arriba en la
  // página como parte esencial del servicio (TrustBar, hero) y ningún plan
  // lo excluye — la fila era redundante.
  { feature: "Puntos o sellos", basico: "Sí", negocio: "Sí", intelligence: "Sí", kind: "boolean" },
  { feature: "Notificaciones de Wallet", basico: "No", negocio: "Sí", intelligence: "Sí", kind: "boolean" },
  { feature: "Avisos por ubicación", basico: "No", negocio: "Sí", intelligence: "Sí", kind: "boolean" },
  {
    feature: "Métricas básicas",
    basico: "Sí",
    negocio: "Sí",
    intelligence: "Sí",
    kind: "boolean",
    details: [
      "Clientes totales registrados",
      "Sellos/visitas totales registradas",
      "Recompensas canjeadas (total)",
    ],
  },
  {
    feature: "Métricas avanzadas",
    basico: "No",
    negocio: "Sí",
    intelligence: "Sí",
    kind: "boolean",
    details: ["Clientes nuevos vs recurrentes", "Frecuencia y tiempo entre visitas", "Tasa de redención"],
  },
];

export const COMPARISON_FOOTNOTE = "*Sujeto a política de uso razonable.";

export const IDEAL_FOR: string[] = [
  "Cafeterías, restaurantes y foodtrucks",
  "Barberías y salones",
  "Gimnasios y estudios",
  "Postres y bebidas",
  "Comercios con clientes recurrentes",
  "Negocios de 1 a 5 sucursales",
  "Negocios que hoy usan tarjetas físicas o promociones frecuentes",
];

export type DifferentiationPoint = { text: string; comingSoon?: boolean };

export const DIFFERENTIATION: DifferentiationPoint[] = [
  { text: "Inteligencia que termina en acción, no solo datos.", comingSoon: true },
  { text: "Cupones personales, de un solo uso y trazables.", comingSoon: true },
  { text: "Ciclo completo de retención: detectar, ejecutar, medir, optimizar." },
  { text: "Acompañamiento real: configuración, capacitación y soporte." },
  { text: "Analítica de recurrencia: el foco es quién regresa, no cuántas tarjetas se emitieron." },
  { text: "Experiencia sin app: el consumidor usa Wallet, que ya está en su teléfono." },
];

export const CAMPAIGN_EXAMPLES: string[] = [
  "Promociona: \"2×1 únicamente por hoy. Consulta tu tarjeta antes de las 8:00 p.m.\"",
  "Recupera: \"Hace tiempo que no te vemos. Te enviamos un cupón personal de $50, válido 7 días.\"",
  "Celebra: \"¡Feliz cumpleaños! Abre tu tarjeta y usa tu regalo antes de que termine el mes.\"",
  "Agradece: \"Gracias por regresar. Recibe doble sello en tu próxima visita.\"",
  "Día de baja demanda: \"Este martes, puntos dobles presentando tu tarjeta Wallet.\"",
];

// wa.me exige el número en formato internacional sin "+" ni espacios.
export const CONTACT = {
  whatsappNumberDisplay: "+52 229 339 1514",
  whatsappNumberDigits: "522293391514",
  email: "admin@pragmia-data.com",
  location: "Veracruz, México",
  salesMessage:
    "Somos de Veracruz y desarrollamos un programa de lealtad para que tus clientes guarden su tarjeta en Apple Wallet o Google Wallet, sin descargar una app. Puedes actualizar promociones, enviar cupones personales y revisar cuántos clientes regresan. ¿Te enseño una demo de 10 minutos?",
} as const;

export function buildWhatsappLink(customMessage?: string): string {
  const message = customMessage ?? CONTACT.salesMessage;
  return `https://wa.me/${CONTACT.whatsappNumberDigits}?text=${encodeURIComponent(message)}`;
}

export const SEO = {
  siteName: BRAND.name,
  defaultTitle: `${BRAND.name}: programa de lealtad en Apple Wallet y Google Wallet`,
  defaultDescription:
    "Crea tu programa de lealtad, registra cada visita en Apple Wallet y Google Wallet, y descubre qué acciones hacen que tus clientes regresen.",
  locale: "es_MX",
} as const;
