import type { MetadataRoute } from "next";

// App Router genera /manifest.webmanifest e inyecta el <link> automáticamente
// — no hace falta tocar layout.tsx. start_url apunta al scanner: es la
// pantalla que un empleado abre al instalar la PWA en el mostrador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fidelización — Scanner",
    short_name: "Scanner",
    description: "Escanea, sella y canjea la tarjeta de sellos de tus clientes.",
    start_url: "/scanner",
    display: "standalone",
    background_color: "#F5F8FC",
    theme_color: "#085AB3",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
