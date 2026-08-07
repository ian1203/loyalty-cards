import type { MetadataRoute } from "next";

// Solo las 2 rutas públicas de marketing — nunca nada de producto
// (dashboard/scanner/admin/customers/rewards son privadas, tenant-scoped,
// y no deben indexarse ni listarse acá). "/precios" ya no es una ruta
// aparte — es una sección ancla (id="precios") dentro de "/".
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const routes = ["", "/privacidad"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
