import { buildPassJson, buildPkpass, buildRelevantText } from "@loyalty/wallet";
import { getApplePassTypeIdentifier, getAppleTeamIdentifier, getPkpassSigner } from "../../../../lib/wallet/adapters";

export const runtime = "nodejs";

// RUTA TEMPORAL DE PRUEBA — research + scaffolding de notificación por
// proximidad (Apple locations). NO usa datos de ningún negocio/cliente
// real: serialNumber/customerFirstName/walletToken son sintéticos, sin
// fila en wallet_passes ni sesión. El motivo de que exista una ruta en vez
// de un script local: firmar un .pkpass que un iPhone real acepte exige
// las credenciales REALES de Apple (WALLET_APPLE_*), que solo viven en el
// entorno de Vercel — están marcadas "Sensitive" y no se pueden extraer
// con `vercel env pull` a una máquina local (confirmado, no asumido). Sin
// esto, la única firma disponible en un script local es la fake
// (createFakePkpassSigner), que un dispositivo real rechaza.
// authenticationToken/webServiceUrl apuntan a algo real pero sin fila
// correspondiente en wallet_passes — si el dispositivo intenta
// registrarse para push, el web service real devuelve 401 (sin efectos
// secundarios, mismo camino de "token inválido" que cualquier otro caso).
// Borrar este archivo una vez confirmada la prueba en dispositivo.
export async function GET() {
  const cycleStamps = 4;
  const stampsRequired = 6;
  const rewardName = "Recompensa de prueba";
  const relevantText = buildRelevantText(cycleStamps, stampsRequired, rewardName);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return new Response("NEXT_PUBLIC_SITE_URL no configurado", { status: 500 });
  }

  const passJson = buildPassJson({
    serialNumber: "geofence-test-00000000-0000-0000-0000-000000000000",
    authenticationToken: "geofence-test-token-sin-fila-real",
    webServiceUrl: `${siteUrl}/api/wallet/apple`,
    passTypeIdentifier: getApplePassTypeIdentifier(),
    teamIdentifier: getAppleTeamIdentifier(),
    organizationName: "PRUEBA — geofence",
    programName: "Prueba de ubicaciones",
    customerFirstName: "Prueba",
    cycleStamps,
    stampsRequired,
    rewardName,
    walletToken: `geofence-test-${Date.now()}`,
    colors: {
      backgroundRgb: [219, 10, 0],
      foregroundRgb: [255, 244, 227],
      labelRgb: [255, 217, 179],
    },
    // Las 3 coordenadas reales confirmadas — CHILAQUIKES local, foodtruck
    // Torrente, foodtruck Calasanz. Mismo relevantText dinámico
    // (buildRelevantText) en las 3, para probar exactamente el mecanismo
    // que se pidió: NO texto hardcodeado, calculado a partir de
    // cycleStamps/stampsRequired/rewardName arriba.
    locations: [
      { latitude: 19.175369, longitude: -96.1212448, relevantText },
      { latitude: 19.1552634, longitude: -96.1311204, relevantText },
      { latitude: 19.1242781, longitude: -96.14227, relevantText },
    ],
  });

  const pkpass = await buildPkpass({
    passJson,
    signer: getPkpassSigner(),
    iconRgb: [219, 10, 0],
  });

  return new Response(pkpass as BodyInit, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": "attachment; filename=prueba-geofence.pkpass",
    },
  });
}
