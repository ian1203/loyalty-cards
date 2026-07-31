// El guard de arranque de la integración Wallet (ver
// .claude/skills/wallet-integration/SKILL.md): UN solo punto que lee el
// entorno y decide, por proveedor, si activa la implementación REAL o cae
// a la FAKE. El resto del código nunca pregunta "¿hay credenciales?" — solo
// recibe el adaptador ya resuelto. Faltar credenciales NO revienta el
// arranque: es el estado esperado en dev/CI, se loguea claro y se sigue
// con la fake.

export type WalletProviderStatus = {
  active: boolean;
  missing: string[];
};

export type AppleCredentials = {
  teamId: string;
  passTypeIdentifier: string;
  passCertPem: string;
  passKeyPem: string;
  wwdrCertPem: string;
  apnsKeyId: string;
  apnsPrivateKeyPem: string;
};

export type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
};

export type GoogleCredentials = {
  issuerId: string;
  serviceAccount: GoogleServiceAccount;
};

export type WalletConfig = {
  apple: { status: WalletProviderStatus; credentials: AppleCredentials | null };
  google: { status: WalletProviderStatus; credentials: GoogleCredentials | null };
};

const APPLE_ENV_KEYS = [
  "WALLET_APPLE_TEAM_ID",
  "WALLET_APPLE_PASS_TYPE_IDENTIFIER",
  "WALLET_APPLE_PASS_CERT_PEM",
  "WALLET_APPLE_PASS_KEY_PEM",
  "WALLET_APPLE_WWDR_CERT_PEM",
  "WALLET_APPLE_APNS_KEY_ID",
  "WALLET_APPLE_APNS_PRIVATE_KEY_PEM",
] as const;

const GOOGLE_ENV_KEYS = ["WALLET_GOOGLE_ISSUER_ID", "WALLET_GOOGLE_SERVICE_ACCOUNT_JSON"] as const;

// Logger inyectable para que los tests puedan capturar los mensajes sin
// ensuciar stdout — por defecto, console real.
export type WalletConfigLogger = {
  info(message: string): void;
  warn(message: string): void;
};

const defaultLogger: WalletConfigLogger = {
  info: (message) => console.info(`[wallet] ${message}`),
  warn: (message) => console.warn(`[wallet] ${message}`),
};

function readEnv(env: NodeJS.ProcessEnv, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, env[key]]));
}

function resolveApple(
  env: NodeJS.ProcessEnv,
  logger: WalletConfigLogger,
): { status: WalletProviderStatus; credentials: AppleCredentials | null } {
  const values = readEnv(env, APPLE_ENV_KEYS);
  const missing = APPLE_ENV_KEYS.filter((key) => !values[key]);

  if (missing.length === 0) {
    logger.info("Apple: credenciales completas — usando firma/APNs reales.");
    return {
      status: { active: true, missing: [] },
      credentials: {
        teamId: values.WALLET_APPLE_TEAM_ID!,
        passTypeIdentifier: values.WALLET_APPLE_PASS_TYPE_IDENTIFIER!,
        passCertPem: values.WALLET_APPLE_PASS_CERT_PEM!,
        passKeyPem: values.WALLET_APPLE_PASS_KEY_PEM!,
        wwdrCertPem: values.WALLET_APPLE_WWDR_CERT_PEM!,
        apnsKeyId: values.WALLET_APPLE_APNS_KEY_ID!,
        apnsPrivateKeyPem: values.WALLET_APPLE_APNS_PRIVATE_KEY_PEM!,
      },
    };
  }

  if (missing.length === APPLE_ENV_KEYS.length) {
    logger.info("Apple: sin credenciales configuradas — usando firma/APNs fake (esperado en dev/CI).");
  } else {
    // Configuración PARCIAL: alguien seteó algo pero no todo — casi
    // siempre un error real (typo de nombre de var, deploy a medias), no
    // el "sin configurar" esperado. WARN, no INFO.
    logger.warn(
      `Apple: configuración incompleta, cayendo a fake. Faltan: ${missing.join(", ")}.`,
    );
  }
  return { status: { active: false, missing: [...missing] }, credentials: null };
}

function resolveGoogle(
  env: NodeJS.ProcessEnv,
  logger: WalletConfigLogger,
): { status: WalletProviderStatus; credentials: GoogleCredentials | null } {
  const values = readEnv(env, GOOGLE_ENV_KEYS);
  const missing = GOOGLE_ENV_KEYS.filter((key) => !values[key]);

  if (missing.length === 0) {
    const issuerId = values.WALLET_GOOGLE_ISSUER_ID!;
    const raw = values.WALLET_GOOGLE_SERVICE_ACCOUNT_JSON!;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn(
        "Google: WALLET_GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido — cayendo a fake.",
      );
      return {
        status: { active: false, missing: ["WALLET_GOOGLE_SERVICE_ACCOUNT_JSON (JSON inválido)"] },
        credentials: null,
      };
    }
    const serviceAccount = parsed as Partial<GoogleServiceAccount>;
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      logger.warn(
        "Google: WALLET_GOOGLE_SERVICE_ACCOUNT_JSON no trae client_email/private_key — cayendo a fake.",
      );
      return {
        status: {
          active: false,
          missing: ["WALLET_GOOGLE_SERVICE_ACCOUNT_JSON (client_email/private_key)"],
        },
        credentials: null,
      };
    }
    logger.info("Google: credenciales completas — usando firma/API reales.");
    return {
      status: { active: true, missing: [] },
      credentials: { issuerId, serviceAccount: serviceAccount as GoogleServiceAccount },
    };
  }

  if (missing.length === GOOGLE_ENV_KEYS.length) {
    logger.info("Google: sin credenciales configuradas — usando firma fake (esperado en dev/CI).");
  } else {
    logger.warn(
      `Google: configuración incompleta, cayendo a fake. Faltan: ${missing.join(", ")}.`,
    );
  }
  return { status: { active: false, missing: [...missing] }, credentials: null };
}

// Construye la config desde CERO cada vez — sin memoizar acá adentro, para
// que los tests puedan pasar distintos `env`/logger sin pisarse. La
// memoización real (una vez por proceso, sin recalcular en cada request)
// vive en apps/web, que es quien conoce el `process.env` real y puede
// cachear con seguridad (ver apps/web/lib/wallet/adapters.ts).
export function resolveWalletConfig(
  env: NodeJS.ProcessEnv = process.env,
  logger: WalletConfigLogger = defaultLogger,
): WalletConfig {
  return {
    apple: resolveApple(env, logger),
    google: resolveGoogle(env, logger),
  };
}
