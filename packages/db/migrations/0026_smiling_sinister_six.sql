ALTER TABLE "businesses" ADD COLUMN "enroll_show_shipping_address" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_address" text;