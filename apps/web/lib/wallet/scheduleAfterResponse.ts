import { after } from "next/server";

// after() (next/server) exige correr DENTRO de una request real de
// Next.js — igual que cookies() (next/headers, ver el comentario en
// lib/supabase/server.ts): revienta ("called outside a request scope")
// si se llama desde un test o script que invoca la lógica directo, sin
// levantar next dev/start. registerStampForSession/redeemRewardForSession
// se testean llamándolas directo (mismo patrón de todo el codebase desde
// Fase 2) — necesitan seguir funcionando así.
//
// En producción (dentro de una request real), usa after(): garantiza que
// el proceso no mate el push antes de que termine. Fuera de una request
// (tests), cae a un fire-and-forget directo — el caller nunca espera el
// resultado de todos modos (best-effort), así que el comportamiento
// observable es el mismo salvo por CUÁNDO exactamente corre.
export function scheduleAfterResponse(fn: () => void | Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn();
  }
}
