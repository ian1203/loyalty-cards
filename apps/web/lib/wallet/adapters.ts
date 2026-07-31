import {
  createFakeApnsSender,
  createFakeGoogleWalletClient,
  createFakePkpassSigner,
  createRealApnsSender,
  createRealGoogleWalletClient,
  createRealPkpassSigner,
  resolveWalletConfig,
  type ApnsSender,
  type FakeGoogleWalletClient,
  type GoogleWalletClient,
  type PkpassSigner,
  type RecordedApnsPush,
  type WalletConfig,
} from "@loyalty/wallet";

// El ÚNICO lugar de apps/web que llama resolveWalletConfig() y construye
// los adaptadores — memoizado por proceso (paso b/c de la skill: el resto
// del código nunca pregunta "¿hay credenciales?", solo recibe el
// adaptador ya resuelto). Nada de esto reconstruye nada en cada request.

let cachedConfig: WalletConfig | null = null;
let cachedPkpassSigner: PkpassSigner | null = null;
let cachedApnsSender: ApnsSender | null = null;
let cachedGoogleClient: GoogleWalletClient | null = null;
let fakeApnsSentPushes: RecordedApnsPush[] = [];

function getConfig(): WalletConfig {
  if (!cachedConfig) {
    cachedConfig = resolveWalletConfig();
  }
  return cachedConfig;
}

export function getPkpassSigner(): PkpassSigner {
  if (!cachedPkpassSigner) {
    const config = getConfig();
    cachedPkpassSigner = config.apple.credentials
      ? createRealPkpassSigner(config.apple.credentials)
      : createFakePkpassSigner();
  }
  return cachedPkpassSigner;
}

export function getApnsSender(): ApnsSender {
  if (!cachedApnsSender) {
    const config = getConfig();
    if (config.apple.credentials) {
      cachedApnsSender = createRealApnsSender(config.apple.credentials);
    } else {
      fakeApnsSentPushes = [];
      cachedApnsSender = createFakeApnsSender(fakeApnsSentPushes);
    }
  }
  return cachedApnsSender;
}

// Solo tiene sentido cuando la impl activa es la fake — expone lo que se
// "hubiera mandado", para que los tests de notifyWalletOfTransaction (paso
// g/j) verifiquen "se encoló exactamente un push por dispositivo" sin
// infraestructura real.
export function getFakeApnsSentPushes(): RecordedApnsPush[] {
  return fakeApnsSentPushes;
}

export function getGoogleWalletClient(): GoogleWalletClient {
  if (!cachedGoogleClient) {
    const config = getConfig();
    cachedGoogleClient = config.google.credentials
      ? createRealGoogleWalletClient(config.google.credentials)
      : createFakeGoogleWalletClient();
  }
  return cachedGoogleClient;
}

// Igual que getFakeApnsSentPushes: solo tiene sentido con la impl fake
// activa — expone insertCalls/patchCalls para que los tests de
// notifyWalletOfTransaction verifiquen "se llamó upsertLoyaltyObject
// exactamente una vez con el payload correcto" sin red real. null si la
// impl real está activa (no hay nada que grabar).
export function getFakeGoogleWalletCalls(): FakeGoogleWalletClient | null {
  const client = getGoogleWalletClient();
  return "patchCalls" in client ? (client as FakeGoogleWalletClient) : null;
}

export function getApplePassTypeIdentifier(): string {
  return getConfig().apple.credentials?.passTypeIdentifier ?? "pass.dev.loyalty.fake";
}

export function getAppleTeamIdentifier(): string {
  return getConfig().apple.credentials?.teamId ?? "FAKETEAMID";
}

export function getGoogleIssuerId(): string {
  return getConfig().google.credentials?.issuerId ?? "fake-issuer-id";
}

export function isAppleWalletActive(): boolean {
  return getConfig().apple.status.active;
}

export function isGoogleWalletActive(): boolean {
  return getConfig().google.status.active;
}

// Solo para tests: fuerza recalcular todo — necesario porque los tests de
// integración (paso j) cambian process.env entre casos para probar real
// vs. fake, y sin esto los adaptadores memoizados de un test contaminarían
// al siguiente.
export function __resetWalletAdaptersForTests(): void {
  cachedConfig = null;
  cachedPkpassSigner = null;
  cachedApnsSender = null;
  cachedGoogleClient = null;
  fakeApnsSentPushes = [];
}
