// Botón oficial de Google ("Add to Google Wallet" wallet-button,
// localización es419 — español latinoamericano; el paquete oficial de
// Google no trae una variante esMX dedicada como sí la hay para Apple, así
// que es419 es la más cercana para audiencia mexicana), entregado sin
// tocar (guidelines de Google: no recolorear, no deformar — solo escalar
// proporcionalmente y respetar espacio libre alrededor). El SVG vive tal
// cual en public/brand/google-wallet-button-es419.svg, servido como
// <img> — nunca se edita su contenido. Mismo patrón que
// AppleWalletBadge.tsx. El <a> en sí (href, sin download) es lo único
// nuestro: navega al link "Add to Google Wallet" real (JWT firmado, ver
// googleSaveLink.ts).
export function GoogleWalletBadge({ href }: { href: string }) {
  return (
    <a href={href} className="inline-block" aria-label="Agregar a Google Wallet">
      {/* eslint-disable-next-line @next/next/no-img-element -- asset oficial servido tal cual, sin necesidad de optimización de next/image */}
      <img src="/brand/google-wallet-button-es419.svg" alt="Agregar a Google Wallet" className="h-11 w-auto" />
    </a>
  );
}
