import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Carga .env.local igual que Next.js, para que los tests tengan las mismas
// variables (NEXT_PUBLIC_SUPABASE_URL, etc.) sin duplicarlas. En CI no
// existe .env.local — ahí esas variables se fijan a nivel de job (ver
// .github/workflows/ci.yml), así que el guard evita que falle por archivo
// ausente.
const envLocalPath = new URL("./.env.local", import.meta.url);
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

export default defineConfig({
  test: {},
});
