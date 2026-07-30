import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

// El middleware de Fase 1 es deliberadamente delgado: su único trabajo es
// refrescar la cookie de sesión de Supabase, nunca resolver tenant ni tomar
// decisiones de autorización (eso vive en getVerifiedSession(), runtime
// Node). La prueba real de que la sesión se refresca y de que los claims
// llegan correctos es el test end-to-end (apps/web/tests/e2e-isolation) con
// login real — aquí solo se confirma que el middleware es un passthrough
// bien comportado, con y sin cookie de sesión.
describe("middleware — refresco de sesión de Supabase (passthrough)", () => {
  it("sin cookie de sesión, no revienta y devuelve una respuesta", async () => {
    const request = new NextRequest("http://localhost/dashboard");
    const response = await middleware(request);
    expect(response).toBeDefined();
    expect(response.status).toBeLessThan(500);
  });

  it("con una cookie de sesión inválida/corrupta, no revienta", async () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "sb-127-auth-token=not-a-real-session" },
    });
    const response = await middleware(request);
    expect(response).toBeDefined();
    expect(response.status).toBeLessThan(500);
  });

  it("ya no reenvía ningún header de tenant (el placeholder de Fase 0 se retiró)", async () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: { "x-business-id": "11111111-1111-1111-1111-111111111111" },
    });
    const response = await middleware(request);
    expect(response.headers.get("x-middleware-request-x-tenant-business-id")).toBeNull();
  });
});
