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

export const HOW_IT_WORKS: HowItWorksStep[] = [
  { step: 1, title: "Alta", description: "El cliente se registra: escanea un QR o abre un enlace." },
  { step: 2, title: "Wallet", description: "Agrega su tarjeta a Apple Wallet o Google Wallet." },
  { step: 3, title: "Visitas", description: "Acumula beneficios (sellos por visita; puntos según mecánica)." },
  { step: 4, title: "Promociones", description: "Recibe promociones directamente en su tarjeta." },
  { step: 5, title: "Medición", description: "El negocio mide altas, visitas, recompensas y redenciones." },
  {
    step: 6,
    title: "Recomendaciones",
    description: "Pragmia recomienda la siguiente acción.",
    comingSoon: true,
  },
];

export type Benefit = { title: string; description: string; comingSoon?: boolean };

export const BENEFITS: Benefit[] = [
  {
    title: "Tarjeta digital sin app",
    description:
      "Apple/Google Wallet, con la identidad visual del negocio, QR/identificador, progreso visible, actualización sin reemplazar la tarjeta.",
  },
  {
    title: "Mecánicas de lealtad",
    description:
      "Sellos por visita: cada visita suma un sello a la tarjeta y, al llegar a la meta que definas, la recompensa se desbloquea sola.",
  },
  {
    title: "Mecánicas avanzadas",
    description: "Puntos por compra, bienvenida, cumpleaños, VIP.",
    comingSoon: true,
  },
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
  comingSoon?: boolean;
};

export const COMPARISON_MATRIX: ComparisonRow[] = [
  { feature: "Precio mensual", basico: "$500", negocio: "$700", intelligence: "$1,000" },
  { feature: "Puntos de venta", basico: "1", negocio: "Hasta 3", intelligence: "Hasta 5" },
  { feature: "Apple/Google Wallet", basico: "Sí", negocio: "Sí", intelligence: "Sí" },
  { feature: "Puntos o sellos", basico: "Sí", negocio: "Sí", intelligence: "Sí" },
  {
    feature: "Promociones visibles simultáneas",
    basico: "1",
    negocio: "Hasta 3",
    intelligence: "Sin límite*",
  },
  {
    feature: "Administración de promociones",
    basico: "1 cambio/mes por solicitud",
    negocio: "Desde plataforma",
    intelligence: "Desde plataforma",
  },
  { feature: "Notificaciones de Wallet", basico: "No", negocio: "Sí", intelligence: "Sí" },
  { feature: "Avisos por ubicación", basico: "No", negocio: "Sí", intelligence: "Sí", comingSoon: true },
  {
    feature: "Cupones individuales de un solo uso",
    basico: "No",
    negocio: "Sí",
    intelligence: "Sí",
    comingSoon: true,
  },
  {
    feature: "Envío de cupones por Wallet y correo",
    basico: "No",
    negocio: "Sí",
    intelligence: "Sí",
    comingSoon: true,
  },
  {
    feature: "Cupón automático de cumpleaños",
    basico: "No",
    negocio: "Sí",
    intelligence: "Sí",
    comingSoon: true,
  },
  { feature: "Campañas de temporada", basico: "No", negocio: "Sí", intelligence: "Sí", comingSoon: true },
  {
    feature: "Selección de clientes con filtros",
    basico: "No",
    negocio: "Sí",
    intelligence: "Sí",
    comingSoon: true,
  },
  { feature: "Métricas generales", basico: "Sí", negocio: "Sí", intelligence: "Sí" },
  { feature: "Clientes nuevos vs recurrentes", basico: "No", negocio: "Sí", intelligence: "Sí" },
  { feature: "Frecuencia y tiempo entre visitas", basico: "No", negocio: "Sí", intelligence: "Sí" },
  { feature: "Tasa de redención", basico: "No", negocio: "Sí", intelligence: "Sí" },
  {
    feature: "Comparación entre sucursales",
    basico: "No",
    negocio: "Básica",
    intelligence: "Completa",
  },
  {
    feature: "Segmentación por comportamiento",
    basico: "No",
    negocio: "No",
    intelligence: "Sí",
    comingSoon: true,
  },
  {
    feature: "Detección de inactivos y VIP",
    basico: "No",
    negocio: "No",
    intelligence: "Sí",
    comingSoon: true,
  },
  {
    feature: "Recomendaciones de campaña",
    basico: "No",
    negocio: "No",
    intelligence: "Sí",
    comingSoon: true,
  },
  {
    feature: "Automatización de campañas",
    basico: "No",
    negocio: "No",
    intelligence: "Sí",
    comingSoon: true,
  },
  { feature: "Asistente inteligente", basico: "No", negocio: "No", intelligence: "Sí", comingSoon: true },
  {
    feature: "Exportación de información",
    basico: "No",
    negocio: "No",
    intelligence: "Sí",
    comingSoon: true,
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
  whatsappNumberDisplay: "+52 229 482 8125",
  whatsappNumberDigits: "522294828125",
  email: "info@pragmia-data.com",
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
