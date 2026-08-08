import { Wallet } from "lucide-react";

// Recreación del botón "Agregar a Apple Wallet" siguiendo las guías de
// marca de Apple (negro fijo, sin importar tema claro/oscuro del sitio —
// el badge real de Apple tampoco es theme-aware) — sin depender de ningún
// asset externo (cero fetch a CDN de Apple, mismo criterio que las
// tipografías auto-hosted). Es un <a> normal, SIN atributo download: debe
// navegar a una URL real que responda con
// Content-Type: application/vnd.apple.pkpass para que Safari dispare la
// hoja nativa de instalación — un data: URI o un download aquí rompe
// exactamente el flujo que este componente reemplaza (ver bug corregido
// en EnrollForm.tsx).
export function AppleWalletBadge({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-black px-5 text-white shadow-token-sm transition active:scale-[0.98]"
    >
      <Wallet className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[10px] font-normal uppercase tracking-wide text-white/75">Agregar a</span>
        <span className="text-sm font-semibold tracking-tight">Apple Wallet</span>
      </span>
    </a>
  );
}
