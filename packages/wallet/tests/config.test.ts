import { describe, expect, it, vi } from "vitest";
import { resolveWalletConfig, type WalletConfigLogger } from "../src/config";

const FULL_APPLE_ENV = {
  WALLET_APPLE_TEAM_ID: "TEAM123",
  WALLET_APPLE_PASS_TYPE_IDENTIFIER: "pass.dev.loyalty",
  WALLET_APPLE_PASS_CERT_PEM: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----",
  WALLET_APPLE_PASS_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  WALLET_APPLE_WWDR_CERT_PEM: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----",
  WALLET_APPLE_APNS_KEY_ID: "KEYID123",
  WALLET_APPLE_APNS_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
};

const FULL_GOOGLE_ENV = {
  WALLET_GOOGLE_ISSUER_ID: "3388000000012345678",
  WALLET_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "svc@project.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  }),
};

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn() } satisfies WalletConfigLogger;
}

describe("resolveWalletConfig — Apple", () => {
  it("sin ninguna var: fake, log INFO (estado esperado), nunca crashea", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig({}, logger);

    expect(config.apple.status.active).toBe(false);
    expect(config.apple.status.missing).toHaveLength(7);
    expect(config.apple.credentials).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("sin credenciales"));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("con TODAS las vars: real, credenciales completas, log INFO", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig(FULL_APPLE_ENV, logger);

    expect(config.apple.status).toEqual({ active: true, missing: [] });
    expect(config.apple.credentials).toEqual({
      teamId: "TEAM123",
      passTypeIdentifier: "pass.dev.loyalty",
      passCertPem: FULL_APPLE_ENV.WALLET_APPLE_PASS_CERT_PEM,
      passKeyPem: FULL_APPLE_ENV.WALLET_APPLE_PASS_KEY_PEM,
      wwdrCertPem: FULL_APPLE_ENV.WALLET_APPLE_WWDR_CERT_PEM,
      apnsKeyId: "KEYID123",
      apnsPrivateKeyPem: FULL_APPLE_ENV.WALLET_APPLE_APNS_PRIVATE_KEY_PEM,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("configuración PARCIAL (falta una sola var): fake, pero WARN con la var exacta que falta", () => {
    const logger = fakeLogger();
    const { WALLET_APPLE_APNS_KEY_ID: _omitted, ...partial } = FULL_APPLE_ENV;
    const config = resolveWalletConfig(partial, logger);

    expect(config.apple.status.active).toBe(false);
    expect(config.apple.status.missing).toEqual(["WALLET_APPLE_APNS_KEY_ID"]);
    expect(config.apple.credentials).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("WALLET_APPLE_APNS_KEY_ID"),
    );
    // Nunca INFO para Apple específicamente ("parcial" no es "esperado") —
    // Google sí loguea INFO en esta llamada (sus vars ni se tocaron), así
    // que no se puede afirmar "info nunca se llamó" en general.
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("Apple"));
  });
});

describe("resolveWalletConfig — Google", () => {
  it("sin ninguna var: fake, log INFO, nunca crashea", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig({}, logger);

    expect(config.google.status).toEqual({
      active: false,
      missing: ["WALLET_GOOGLE_ISSUER_ID", "WALLET_GOOGLE_SERVICE_ACCOUNT_JSON"],
    });
    expect(config.google.credentials).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("con TODAS las vars y JSON válido: real, service account parseado", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig(FULL_GOOGLE_ENV, logger);

    expect(config.google.status).toEqual({ active: true, missing: [] });
    expect(config.google.credentials?.issuerId).toBe("3388000000012345678");
    expect(config.google.credentials?.serviceAccount.client_email).toBe(
      "svc@project.iam.gserviceaccount.com",
    );
  });

  it("JSON malformado en WALLET_GOOGLE_SERVICE_ACCOUNT_JSON: fake, WARN, nunca crashea", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig(
      { ...FULL_GOOGLE_ENV, WALLET_GOOGLE_SERVICE_ACCOUNT_JSON: "{not-json" },
      logger,
    );

    expect(config.google.status.active).toBe(false);
    expect(config.google.credentials).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("JSON válido"));
  });

  it("JSON válido pero sin client_email/private_key: fake, WARN", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig(
      { ...FULL_GOOGLE_ENV, WALLET_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ foo: "bar" }) },
      logger,
    );

    expect(config.google.status.active).toBe(false);
    expect(config.google.credentials).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("resolveWalletConfig — proveedores independientes", () => {
  it("Apple activo y Google inactivo (o viceversa) no se pisan entre sí", () => {
    const logger = fakeLogger();
    const config = resolveWalletConfig(FULL_APPLE_ENV, logger);

    expect(config.apple.status.active).toBe(true);
    expect(config.google.status.active).toBe(false);
  });
});
