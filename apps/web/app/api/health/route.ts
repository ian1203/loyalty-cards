// Explícito, no solo el default de Next: ninguna ruta de esta app corre en
// Edge salvo middleware.ts (que nunca toca @loyalty/db — ver su propio
// comentario). Edge no soporta el driver `pg`, así que esto es la
// declaración permanente, no un detalle de esta ruta en particular.
export const runtime = "nodejs";

export function GET() {
  return Response.json({ ok: true });
}
