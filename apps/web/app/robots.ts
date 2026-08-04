import type { MetadataRoute } from "next";

// Permite indexar SOLO la landing de marketing; bloquea explícitamente
// toda ruta de producto (tenant-scoped) y de API — ninguna de esas debe
// aparecer en un buscador, aunque ya estén protegidas por sesión/RLS.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/precios", "/privacidad"],
      disallow: [
        "/dashboard",
        "/admin",
        "/scanner",
        "/customers",
        "/rewards",
        "/login",
        "/set-password",
        "/api",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
