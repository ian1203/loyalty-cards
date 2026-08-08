"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiftIcon, LayoutDashboardIcon, MenuIcon, ScanLineIcon, UsersIcon } from "lucide-react";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { cn } from "../lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/rewards", label: "Programa", icon: GiftIcon },
  { href: "/customers", label: "Clientes", icon: UsersIcon },
  { href: "/scanner", label: "Scanner", icon: ScanLineIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Filtro cosmético — nunca el control real (eso vive server-side en cada
// page.tsx/route.ts, ver la auditoría RBAC). Solo evita que un staff vea
// links a pantallas de las que igual lo rebota el servidor.
function navItemsForRole(role: string) {
  return role === "staff" ? NAV_ITEMS.filter((item) => item.href === "/scanner") : NAV_ITEMS;
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

export function AppShell({
  businessName,
  email,
  role,
  children,
}: {
  businessName: string;
  email: string;
  role: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = navItemsForRole(role);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {businessName}
          </p>
          <NavLinks pathname={pathname} items={navItems} />
        </div>
        <Separator />
        <div className="p-2">
          <UserMenu email={email} role={role} />
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
              <Logo />
            </SheetHeader>
            <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
              <div>
                <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {businessName}
                </p>
                <NavLinks pathname={pathname} items={navItems} onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t pt-2">
                <UserMenu email={email} role={role} />
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
