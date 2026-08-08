/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
