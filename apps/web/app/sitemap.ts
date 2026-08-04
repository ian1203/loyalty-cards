import type { MetadataRoute } from "next";

// Solo las 3 rutas públicas de marketing — nunca nada de producto
// (dashboard/scanner/admin/customers/rewards son privadas, tenant-scoped,
// y no deben indexarse ni listarse acá).
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const routes = ["", "/precios", "/privacidad"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
