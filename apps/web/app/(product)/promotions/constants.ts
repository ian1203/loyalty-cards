// Separado de logic.ts a propósito: logic.ts importa transitivamente
// notifyWalletOfPromoBroadcast → scheduleAfterResponse → next/server
// (after()), válido SOLO en Server Components/Route Handlers. Un import
// de VALOR (no de tipo) desde un "use client" arrastra el módulo entero
// al bundle del cliente — bug real encontrado en el build de Vercel
// (PromoBroadcastForm.tsx importaba MAX_PROMO_MESSAGE_LENGTH directo de
// "./logic", webpack fallaba: "You're importing a module that depends on
// 'after'... in the Pages Router"). Este archivo no importa nada de
// server — seguro de usar desde cualquier lado.
export const MAX_PROMO_MESSAGE_LENGTH = 180;

// Límites por plan (ver tabla de precios, fila "Notificaciones de
// Wallet") — propuestos, no un número documentado por Apple/Google,
// ajustable con uso real igual que el resto de límites de la plataforma.
// "basico" no aparece: se bloquea por completo antes de llegar a esta
// tabla (ver planGateError en logic.ts).
export const DAILY_LIMIT = 1;
export const MONTHLY_LIMIT_BY_PLAN: Record<"negocio" | "intelligence", number> = {
  negocio: 5,
  intelligence: 10,
};
