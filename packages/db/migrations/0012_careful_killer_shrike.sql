CREATE TABLE "marketing_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_name" text NOT NULL,
	"business_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- marketing_leads: sin business_id, así que no hay RLS que activar (nada
-- que aislar por tenant) — el lead se captura desde una landing pública
-- ANTES de que exista ningún negocio. Grant deliberadamente distinto del
-- patrón "tenant_isolation" del resto del esquema: la escribe una request
-- pública sin sesión, así que tiene que ser app_user (adminDb nunca sirve
-- una request normal, regla no negociable), pero SOLO INSERT — sin SELECT/
-- UPDATE/DELETE, porque leer/gestionar leads es una tarea manual/operativa
-- por ahora, nunca expuesta en la app pública.
GRANT INSERT ON TABLE "marketing_leads" TO app_user;
