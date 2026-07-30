# Plataforma de fidelización — Tarjetas digitales en Wallet

## Misión
Plataforma multi-tenant de fidelización y recompra para negocios locales,
mediante tarjetas digitales en Apple Wallet y Google Wallet. NO es solo un
generador de tarjetas: el núcleo es el motor de lealtad y la separación de datos.

## Fase actual: FASE 0 — Cimientos
En scope AHORA:
- Scaffolding del monorepo, CI, entornos.
- Esquema y migraciones de las tablas core (todas con business_id).
- Políticas RLS por business_id en toda tabla tenant.
- Middleware que fija el contexto de tenant por request.
- Test que prueba que un negocio NO puede leer datos de otro.

FUERA de scope (no lo construyas todavía):
- UI de dashboard, scanner PWA, páginas de enroll.
- Integración con Apple/Google Wallet.
- Reportes, promociones, campañas.
No adelantes fases. Si algo parece requerirlo, pregunta primero.

## Arquitectura (decidida, no re-litigar)
- Monorepo, TypeScript-first. Frontend: Next.js. DB: PostgreSQL (Supabase/Neon).
- Motor de lealtad como paquete aislado y testeable (packages/core).
- Modelo de lealtad: SELLOS por visita (no puntos ni saldo monetario).
  Programa define stamps_required; cada visita = +1 sello; al llegar al total
  se habilita la recompensa y el ciclo se reinicia.

## Reglas NO negociables
- Toda tabla de negocio lleva business_id + created_at/updated_at.
- RLS activo en toda tabla tenant; la app SIEMPRE filtra por tenant además.
- El QR del cliente lleva solo un token opaco/firmado, nunca datos ni saldos.
- Cada movimiento de sello: idempotency_key + cooldown configurable por programa
  (evita doble escaneo y sellos repetidos al mismo cliente).
- Todo cambio sensible se registra en audit_logs (quién, cuándo, sucursal).
- Las migraciones son la fuente de verdad del esquema.

## Definición de "listo" para Fase 0
Existe un test que primero falla y luego pasa, demostrando que un usuario del
negocio A no puede leer ni escribir datos del negocio B.

## Convenciones
- Pregunta antes de instalar dependencias nuevas.
- No toques secretos ni los subas al repo; usa variables de entorno.