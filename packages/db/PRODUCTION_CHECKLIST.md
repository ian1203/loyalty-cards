# Checklist de producción — packages/db

Ítems que deben re-verificarse contra el entorno real de producción antes de
servir tráfico, no darse por buenos solo porque pasan en local.

## Pooler en modo transacción (Supabase/Neon) vs conexión directa local

Todo lo probado en Fase 0 — incluida la regresión de
`tests/pooling-regression.test.ts` — corre contra Postgres directo en Docker
local, sin ningún pooler externo de por medio. El contexto de tenant se fija
con `set_config('app.current_business_id', $1, true)` (equivalente a
`SET LOCAL`, local a la transacción). Un pooler de producción en modo
transacción (PgBouncer, y lo que usan Supabase/Neon internamente — Supavisor
en el caso de Supabase) puede manejar esos GUC personalizados de forma
distinta a una conexión directa, porque puede reasignar la conexión física
entre "transacciones lógicas" de clientes distintos con reglas propias.

- [ ] Antes de servir tráfico real: correr `tests/isolation-write-path.test.ts`
      y `tests/pooling-regression.test.ts` (o equivalentes) apuntando a la
      cadena de conexión real del pooler de producción elegido — no solo
      contra Postgres directo como en Fase 0.
- [ ] Confirmar explícitamente qué modo de pooling usa el proveedor elegido
      (transaction vs session) y cómo documenta el manejo de `SET LOCAL` /
      GUCs personalizados para ese modo. No asumir que se comporta igual que
      la conexión directa local solo porque los tests de Fase 0 pasan.
- [ ] Si el pooler no garantiza que `SET LOCAL` quede correctamente aislado
      por transacción lógica, evaluar alternativas (fijar el tenant vía
      parámetro de conexión, pool dedicado por tenant, etc.) con base en lo
      que arroje esa verificación — no diseñar la solución de antemano.

## Cómo mantener esta lista

Añadir aquí cualquier otra garantía de Fase 0+ que dependa de comportamiento
específico de Postgres/pooler local y que no pueda simularse fielmente antes
de tener acceso al entorno de producción real.
