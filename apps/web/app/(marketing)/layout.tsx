import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../../components/Logo";
import { BRAND, CONTACT, SEO } from "../../lib/marketing/content";
import { WhatsAppFloatButton } from "./components/WhatsAppFloatButton";

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

// Nav superior con anchor links a las secciones de la home (feedback de
// marketing: sin esto el usuario dependía de scroll manual). Todos los
// links usan "/#id" — funcionan igual desde la home y desde cualquier otra
// página de (marketing) (mismo patrón que ya usaba el footer con
// "/#precios"). Oculta en mobile (hidden md:flex): agregar un drawer/Sheet
// para mobile quedó fuera de este cambio a propósito, ver conversación —
// en mobile el usuario sigue navegando por scroll, igual que antes. "Aviso
// de privacidad" sigue sin estar en el header (se sentía invasivo arriba),
// accesible desde el footer.
// Orden idéntico al de las secciones reales en page.tsx (top a bottom):
// precios, cómo funciona, producto, simulación, para quién es, contacto.
const NAV_LINKS = [
  { href: "/#precios", label: "Precios" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#producto", label: "Producto" },
  { href: "/#simulacion", label: "Simulación" },
  { href: "/#para-quien-es", label: "Para quién es" },
  { href: "/#contacto", label: "Contacto" },
] as const;

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="whitespace-nowrap">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground md:flex lg:gap-6">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="whitespace-nowrap hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
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

      <WhatsAppFloatButton />
    </div>
  );
}
