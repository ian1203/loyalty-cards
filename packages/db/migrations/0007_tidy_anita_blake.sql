ALTER TABLE "locations" DROP CONSTRAINT "locations_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "locations" DROP CONSTRAINT "locations_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_primary_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "loyalty_programs" DROP CONSTRAINT "loyalty_programs_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "loyalty_programs" DROP CONSTRAINT "loyalty_programs_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reward_rules" DROP CONSTRAINT "reward_rules_loyalty_program_id_loyalty_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "reward_rules" DROP CONSTRAINT "reward_rules_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reward_rules" DROP CONSTRAINT "reward_rules_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_balances" DROP CONSTRAINT "customer_balances_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_balances" DROP CONSTRAINT "customer_balances_loyalty_program_id_loyalty_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_loyalty_program_id_loyalty_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_employee_id_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_loyalty_program_id_loyalty_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_reward_rule_id_reward_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_reward_id_rewards_id_fk";
--> statement-breakpoint
ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_employee_id_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_employee_id_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "wallet_passes" DROP CONSTRAINT "wallet_passes_customer_id_customers_id_fk";
--> statement-breakpoint
-- Los UNIQUE(id, business_id) deben crearse ANTES que cualquier FK compuesta
-- que los referencie (drizzle-kit generó primero las FKs, orden que Postgres
-- rechaza con "there is no unique constraint matching given keys" — se
-- reordenó a mano).
ALTER TABLE "users" ADD CONSTRAINT "users_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_id_business_id_key" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_business_id_users_fk" FOREIGN KEY ("created_by","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_updated_by_business_id_users_fk" FOREIGN KEY ("updated_by","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_business_id_users_fk" FOREIGN KEY ("user_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_primary_location_id_business_id_locations_fk" FOREIGN KEY ("primary_location_id","business_id") REFERENCES "public"."locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_created_by_business_id_users_fk" FOREIGN KEY ("created_by","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_updated_by_business_id_users_fk" FOREIGN KEY ("updated_by","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_loyalty_program_id_business_id_loyalty_programs_fk" FOREIGN KEY ("loyalty_program_id","business_id") REFERENCES "public"."loyalty_programs"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_created_by_business_id_users_fk" FOREIGN KEY ("created_by","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_updated_by_business_id_users_fk" FOREIGN KEY ("updated_by","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_balances" ADD CONSTRAINT "customer_balances_customer_id_business_id_customers_fk" FOREIGN KEY ("customer_id","business_id") REFERENCES "public"."customers"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_balances" ADD CONSTRAINT "customer_balances_loyalty_program_id_business_id_loyalty_programs_fk" FOREIGN KEY ("loyalty_program_id","business_id") REFERENCES "public"."loyalty_programs"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_business_id_customers_fk" FOREIGN KEY ("customer_id","business_id") REFERENCES "public"."customers"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_loyalty_program_id_business_id_loyalty_programs_fk" FOREIGN KEY ("loyalty_program_id","business_id") REFERENCES "public"."loyalty_programs"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_location_id_business_id_locations_fk" FOREIGN KEY ("location_id","business_id") REFERENCES "public"."locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employee_id_business_id_employees_fk" FOREIGN KEY ("employee_id","business_id") REFERENCES "public"."employees"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_customer_id_business_id_customers_fk" FOREIGN KEY ("customer_id","business_id") REFERENCES "public"."customers"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_loyalty_program_id_business_id_loyalty_programs_fk" FOREIGN KEY ("loyalty_program_id","business_id") REFERENCES "public"."loyalty_programs"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_reward_rule_id_business_id_reward_rules_fk" FOREIGN KEY ("reward_rule_id","business_id") REFERENCES "public"."reward_rules"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_business_id_rewards_fk" FOREIGN KEY ("reward_id","business_id") REFERENCES "public"."rewards"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_location_id_business_id_locations_fk" FOREIGN KEY ("location_id","business_id") REFERENCES "public"."locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_employee_id_business_id_employees_fk" FOREIGN KEY ("employee_id","business_id") REFERENCES "public"."employees"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_business_id_users_fk" FOREIGN KEY ("actor_user_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_employee_id_business_id_employees_fk" FOREIGN KEY ("actor_employee_id","business_id") REFERENCES "public"."employees"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_location_id_business_id_locations_fk" FOREIGN KEY ("location_id","business_id") REFERENCES "public"."locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_customer_id_business_id_customers_fk" FOREIGN KEY ("customer_id","business_id") REFERENCES "public"."customers"("id","business_id") ON DELETE no action ON UPDATE no action;
