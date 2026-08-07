ALTER TABLE "customers" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "occupation" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "privacy_consent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_business_id_phone_key" ON "customers" USING btree ("business_id","phone") WHERE "customers"."phone" is not null;