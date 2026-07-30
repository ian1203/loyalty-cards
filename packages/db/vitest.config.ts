import { defineConfig } from "vitest/config";

// Los tests siempre corren contra loyalty_test, nunca contra loyalty_dev:
// TEST_DATABASE_URL/TEST_APP_DATABASE_URL son la fuente de verdad, y se
// mapean aquí a los nombres que packages/db/src/client.ts espera.
export default defineConfig({
  test: {
    passWithNoTests: true,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      APP_DATABASE_URL: process.env.TEST_APP_DATABASE_URL ?? "",
    },
  },
});
