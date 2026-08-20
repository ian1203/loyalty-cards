import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetBusinessAssetCacheForTests, resolveBusinessAssetBuffer } from "../lib/wallet/businessAssets";

// Hallazgo real de auditoría de rendimiento (ver docs/HISTORY.md):
// /customers/{id}/wallet/apple tardaba 2.7-3.3s consistentemente porque
// generateApplePkpassForCustomer refetcheaba logo/strip/icon × 1x/2x/3x
// (hasta 9 requests HTTPS) en CADA .pkpass generado, aunque son archivos
// de branding estático que casi nunca cambian. Esta prueba confirma que
// el cache realmente evita el refetch — no basta con que el código
// "se vea" cacheado.
describe("resolveBusinessAssetBuffer — cache en memoria", () => {
  beforeEach(() => {
    __resetBusinessAssetCacheForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __resetBusinessAssetCacheForTests();
  });

  it("la segunda llamada a la misma URL NO dispara un segundo fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const first = await resolveBusinessAssetBuffer("https://www.pragmia-data.com/passes/x/logo.png");
    const second = await resolveBusinessAssetBuffer("https://www.pragmia-data.com/passes/x/logo.png");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first?.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it("URLs distintas se cachean por separado, cada una dispara su propio fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Uint8Array([9]), { status: 200 }));

    await resolveBusinessAssetBuffer("https://www.pragmia-data.com/passes/x/logo.png");
    await resolveBusinessAssetBuffer("https://www.pragmia-data.com/passes/x/logo@2x.png");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("un fetch fallido (404) NUNCA se cachea — el siguiente intento reintenta de verdad", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7]), { status: 200 }));

    const first = await resolveBusinessAssetBuffer("https://www.pragmia-data.com/passes/x/strip.png");
    const second = await resolveBusinessAssetBuffer("https://www.pragmia-data.com/passes/x/strip.png");

    expect(first).toBeNull();
    expect(second?.equals(Buffer.from([7]))).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
