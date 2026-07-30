import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

describe("middleware — resolución de tenant por header", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fuera de producción, reenvía x-business-id como x-tenant-business-id", () => {
    vi.stubEnv("NODE_ENV", "development");

    const request = new NextRequest("http://localhost/api/example", {
      headers: { "x-business-id": "11111111-1111-1111-1111-111111111111" },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-business-id")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("en producción, ignora x-business-id (fail-closed, sin autenticación real todavía)", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost/api/example", {
      headers: { "x-business-id": "11111111-1111-1111-1111-111111111111" },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-business-id")).toBeNull();
  });

  it("en producción, despoja un x-tenant-business-id inyectado directamente por el cliente", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost/api/example", {
      headers: { "x-tenant-business-id": "22222222-2222-2222-2222-222222222222" },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-business-id")).toBeNull();
  });
});
