"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { createClient } from "../../lib/supabase/browser";
import type { PlatformRole } from "../../lib/supabase/session";

// Mismo componente/patrón que components/UserMenu.tsx (dueño/staff de
// tenant) — separado a propósito en vez de reusarlo: UserMenu mapea
// TenantRole ("owner"/"admin"/"staff"), esto mapea PlatformRole
// ("owner"/"viewer") — dominios distintos, mismo criterio que ya separa
// /admin del resto del producto en todo lo demás (adminDb, sesión,
// layout).
const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  owner: "Owner",
  viewer: "Viewer",
};

function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

export function AdminUserMenu({ email, platformRole }: { email: string; platformRole: PlatformRole }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar>
          <AvatarFallback>{initialsFor(email)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{email}</span>
          <span className="text-xs text-muted-foreground">{PLATFORM_ROLE_LABELS[platformRole]}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
          <LogOutIcon />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
