-- El test de aislamiento (packages/db/tests/isolation.test.ts) encontró que
-- current_setting('app.current_business_id', true) no siempre devuelve NULL
-- cuando no hay contexto de tenant fijado: bajo connection pooling, una vez
-- que una transacción anterior en la misma conexión física hizo SET LOCAL
-- sobre este GUC personalizado, Postgres lo deja en '' (string vacío) — no
-- en NULL — para transacciones posteriores que no vuelven a fijarlo.
-- '' ::uuid lanza un error de Postgres en vez de simplemente no matchear
-- ninguna fila. NULLIF(..., '') normaliza '' a NULL antes del cast, así el
-- caso "sin contexto" siempre resuelve a "cero filas", nunca a un error.
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "businesses"
  USING ("id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "roles"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "users"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "locations"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "employees"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "customers"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "loyalty_programs"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "reward_rules"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "customer_balances"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "rewards"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "wallet_passes"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "campaigns"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "transactions"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "redemptions"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
--> statement-breakpoint
ALTER POLICY "tenant_isolation" ON "audit_logs"
  USING ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
  WITH CHECK ("business_id" = NULLIF(current_setting('app.current_business_id', true), '')::uuid);
