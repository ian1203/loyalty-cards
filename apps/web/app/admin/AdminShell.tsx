"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2Icon, MenuIcon, ShieldCheckIcon } from "lucide-react";
import { Logo } from "../../components/Logo";
import { Separator } from "../../components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { cn } from "../../lib/utils";
import type { PlatformRole } from "../../lib/supabase/session";
import { AdminUserMenu } from "./AdminUserMenu";

// Shell persistente de TODO /admin — mismo patrón que components/AppShell.tsx
// (sidebar fija desktop + Sheet/drawer móvil), separado a propósito: /admin
// es un dominio de PLATAFORMA, no de tenant (sin businessName, sin
// TenantRole, con su propio NAV_ITEMS). Único lugar donde agregar una
// sección nueva al panel (p.ej. un futuro "/admin/reports") — no dupliques
// esta lista en otro componente.
const NAV_ITEMS = [
  { href: "/admin", label: "Negocios", icon: Building2Icon, ownerOnly: false },
  { href: "/admin/accounts", label: "Cuentas", icon: ShieldCheckIcon, ownerOnly: true },
] as const;

// Filtro cosmético — nunca el control real (eso vive server-side en cada
// page.tsx/route.ts, ver admin/accounts/page.tsx, que redirige a un
// viewer que entre por URL directa). Mismo criterio que navItemsForRole en
// components/AppShell.tsx.
function navItemsForRole(platformRole: PlatformRole) {
  return NAV_ITEMS.filter((item) => !item.ownerOnly || platformRole === "owner");
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  items,
  onNavigate,
}: {
  pathname: string;
  items: readonly (typeof NAV_ITEMS)[number][];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4.5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  email,
  platformRole,
  children,
}: {
  email: string;
  platformRole: PlatformRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = navItemsForRole(platformRole);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Panel de plataforma
          </p>
          <NavLinks pathname={pathname} items={navItems} />
        </div>
        <Separator />
        <div className="p-2">
          <AdminUserMenu email={email} platformRole={platformRole} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mobile */}
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir navegación"
            className="rounded-md p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <MenuIcon className="size-5" />
          </button>
          <Logo className="h-6" />
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b">
              <SheetTitle className="sr-only">Navegación</SheetTitle>
              <Logo className="h-6 self-start" />
            </SheetHeader>
            <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
              <div>
                <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Panel de plataforma
                </p>
                <NavLinks pathname={pathname} items={navItems} onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t pt-2">
                <AdminUserMenu email={email} platformRole={platformRole} />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
