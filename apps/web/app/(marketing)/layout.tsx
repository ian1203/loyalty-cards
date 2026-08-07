import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../../components/Logo";
import { BRAND, CONTACT, SEO } from "../../lib/marketing/content";

// Layout de la superficie PÚBLICA de marketing — separado a propósito del
// resto del producto (dashboard/admin/scanner/etc, fuera de este route
// group). Nunca llama a getVerifiedSession()/requireTenantSession() ni lee
// cookies/headers: eso es justo lo que deja a Next renderizar estas
// páginas de forma estática, cacheable e indexable — el OPUESTO exacto de
// las páginas de producto (dinámicas porque dependen de sesión) y del
// service worker del scanner (que nunca cachea HTML con datos de tenant,
// ver CLAUDE.md). Esta landing no tiene datos de tenant, punto: nada que
// proteger de cachearse.
export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: { default: SEO.defaultTitle, template: `%s | ${SEO.siteName}` },
  description: SEO.defaultDescription,
  openGraph: {
    siteName: SEO.siteName,
    title: SEO.defaultTitle,
    description: SEO.defaultDescription,
    locale: SEO.locale,
    type: "website",
  },
};

// Nav superior deliberadamente mínimo: solo el logo + "Iniciar sesión".
// Ni "Precios" (ahora es una sección ancla dentro de esta misma página,
// no una ruta aparte) ni "Aviso de privacidad" (tenerlo arriba se sentía
// invasivo) — el aviso de privacidad sigue accesible desde el footer.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="whitespace-nowrap">
            <Logo />
          </Link>
          <Link
            href="/login"
            className="whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-medium text-foreground">{BRAND.name}</p>
            <p>{CONTACT.location}</p>
          </div>
          <div className="flex flex-col gap-1">
            <a href={`mailto:${CONTACT.email}`} className="hover:text-foreground">
              {CONTACT.email}
            </a>
            <a href={`tel:+${CONTACT.whatsappNumberDigits}`} className="hover:text-foreground">
              {CONTACT.whatsappNumberDisplay}
            </a>
          </div>
          <nav className="flex flex-col gap-1">
            <Link href="/#precios" className="hover:text-foreground">
              Precios
            </Link>
            <Link href="/privacidad" className="hover:text-foreground">
              Aviso de privacidad
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
