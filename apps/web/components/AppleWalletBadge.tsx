// Badge oficial de Apple ("Add to Apple Wallet Badges", localización
// ESMX — español de México, el idioma de todo el resto del producto),
// entregado sin tocar (guidelines de Apple: no recolorear, no agregar
// sombras/efectos, no deformar — solo escalar proporcionalmente y
// respetar espacio libre alrededor). El SVG vive tal cual en
// public/brand/apple-wallet-badge-es-mx.svg, servido como <img> — nunca
// se edita su contenido. El <a> en sí (href, sin download) es lo único
// nuestro: debe navegar a una URL real que responda con
// Content-Type: application/vnd.apple.pkpass para que Safari dispare la
// hoja nativa de instalación.
export function AppleWalletBadge({ href }: { href: string }) {
  return (
    <a href={href} className="inline-block p-2" aria-label="Agregar a Apple Wallet">
      {/* eslint-disable-next-line @next/next/no-img-element -- asset oficial servido tal cual, sin necesidad de optimización de next/image */}
      <img src="/brand/apple-wallet-badge-es-mx.svg" alt="Agregar a Apple Wallet" className="h-11 w-auto" />
    </a>
  );
}
