import { AppleIcon, MapPinIcon, SmartphoneIcon } from "lucide-react";
import { BRAND } from "../../../lib/marketing/content";

// Franja de confianza, fuera del hero a propósito (el hero es para la
// promesa y el CTA; una micro-franja de confianza dentro del hero compite
// por atención con el mensaje principal). Barra delgada de una sola línea,
// nunca un segundo bloque de copy.
export function TrustBar() {
  return (
    <div className="border-b bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-3.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <AppleIcon className="size-4" aria-hidden="true" /> Apple Wallet
        </span>
        <span className="flex items-center gap-1.5">
          <SmartphoneIcon className="size-4" aria-hidden="true" /> Google Wallet
        </span>
        <span className="flex items-center gap-1.5">
          <MapPinIcon className="size-4" aria-hidden="true" /> Hecho en {BRAND.location}
        </span>
      </div>
    </div>
  );
}
