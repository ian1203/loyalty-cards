import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo pnpm: sharp vive en node_modules/.pnpm (virtual store),
  // symlinkeado. Sin esto, el file-tracer de Next solo mira dentro de
  // apps/web y puede no seguir el symlink hasta el binario nativo real —
  // gotcha documentado de Next+pnpm+binarios nativos en Vercel. Apunta a
  // la raíz del monorepo para que el tracer resuelva la ubicación física
  // real de @img/sharp-linux-x64.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Next 16 bloquea por default los recursos de dev (HMR, y con eso la
  // hidratación del cliente en dev) si el Origin no está en esta lista —
  // "127.0.0.1" NO cuenta como "localhost" automáticamente, y un túnel
  // (cloudflared, para probar en teléfono real) tampoco. Sin esto, el JS
  // nunca hidrata: los <form> quedan como HTML inerte (sin handlers de
  // React), un submit real hace un GET nativo a la misma URL — el bug de
  // "el login no redirige" que bloqueaba la demo. Solo afecta `next dev`
  // (build de producción no tiene este runtime).
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.trycloudflare.com"],
  // sharp (packages/wallet, generación del .pkpass con marca) es un
  // binario nativo — sin esto, Next intenta bundlearlo con el resto del
  // código de servidor y el binario linux-x64 (libvips-cpp.so) se pierde
  // en el tracing, reventando en runtime con ERR_DLOPEN_FAILED (bug real
  // encontrado en producción: /enroll devolvía 500 en cualquier negocio
  // con hero/logo de Wallet cargado). serverExternalPackages deja que
  // Node lo resuelva con require() normal en vez de bundlearlo.
  serverExternalPackages: ["sharp"],
  // Refuerzo explícito (además de serverExternalPackages) para las rutas
  // que de verdad llaman generateApplePkpassForCustomer — fuerza incluir
  // el binario nativo linux-x64 de sharp en el bundle de esas funciones
  // serverless puntuales, sin depender solo de que el tracer automático
  // lo siga bien.
  outputFileTracingIncludes: {
    "/api/wallet/apple/**": [
      "./node_modules/.pnpm/@img+sharp-linux-x64@*/**/*",
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/**/*",
    ],
    "/enroll/**": [
      "./node_modules/.pnpm/@img+sharp-linux-x64@*/**/*",
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/**/*",
    ],
    "/customers/**": [
      "./node_modules/.pnpm/@img+sharp-linux-x64@*/**/*",
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/**/*",
    ],
  },
};

export default nextConfig;
