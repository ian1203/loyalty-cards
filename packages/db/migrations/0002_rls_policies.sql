-- Rol de aplicación: sin BYPASSRLS, no es owner de las tablas (las crea el
-- rol de migraciones/superusuario). Toda request real de la app se conecta
-- con este rol, nunca con el rol de servicio.
-- Password fija de desarrollo local (igual que POSTGRES_PASSWORD=postgres en
-- docker-compose.yml) — no es un secreto de producción, esto es Postgres en
-- Docker para dev/test.
-- Los roles son a nivel de clúster (no por base de datos): con dos bases
-- (loyalty_dev, loyalty_test) en el mismo clúster, CREATE ROLE debe ser
-- idempotente para que la migración corra limpia contra ambas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user';
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;

-- businesses: raíz del tenant, la política usa "id" en vez de "business_id".
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "businesses" TO app_user;
--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "businesses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "businesses"
  USING ("id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.current_business_id', true)::uuid);

-- roles
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "roles" TO app_user;
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "roles"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- users
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "users" TO app_user;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "users"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- locations
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "locations" TO app_user;
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "locations"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- employees
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "employees" TO app_user;
--> statement-breakpoint
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employees"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- customers
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "customers" TO app_user;
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "customers"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- loyalty_programs
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "loyalty_programs" TO app_user;
--> statement-breakpoint
ALTER TABLE "loyalty_programs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "loyalty_programs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "loyalty_programs"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- reward_rules
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "reward_rules" TO app_user;
--> statement-breakpoint
ALTER TABLE "reward_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reward_rules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reward_rules"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- customer_balances
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "customer_balances" TO app_user;
--> statement-breakpoint
ALTER TABLE "customer_balances" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customer_balances" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "customer_balances"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- rewards
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "rewards" TO app_user;
--> statement-breakpoint
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rewards" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "rewards"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- wallet_passes
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "wallet_passes" TO app_user;
--> statement-breakpoint
ALTER TABLE "wallet_passes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "wallet_passes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "wallet_passes"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- campaigns
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "campaigns" TO app_user;
--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "campaigns"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

-- transactions, redemptions, audit_logs: ledger append-only — solo
-- SELECT/INSERT, sin UPDATE ni DELETE (un evento no se edita ni se borra).
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "transactions" TO app_user;
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "transactions"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "redemptions" TO app_user;
--> statement-breakpoint
ALTER TABLE "redemptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "redemptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "redemptions"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);

--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "audit_logs" TO app_user;
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING ("business_id" = current_setting('app.current_business_id', true)::uuid)
  WITH CHECK ("business_id" = current_setting('app.current_business_id', true)::uuid);
