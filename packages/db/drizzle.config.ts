import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Explícito a propósito: authUsers.ts declara una tabla "sombra" de
  // auth.users (que administra Supabase Auth, no nosotros) solo para poder
  // tipar FKs contra ella. Sin este filtro, drizzle-kit podría intentar
  // generar un CREATE TABLE para el schema "auth".
  schemaFilter: ["public"],
  dbCredentials: {
    url: connectionString,
  },
});
