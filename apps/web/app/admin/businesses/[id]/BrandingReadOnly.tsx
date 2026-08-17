type Branding = {
  brandColorHex: string | null;
  logoUrl: string | null;
  walletLogoUrl: string | null;
  walletHeroUrl: string | null;
  googleLogoUri: string | null;
  googleHeroUri: string | null;
  googleWideLogoUri: string | null;
};

const FIELD_LABELS: Record<keyof Branding, string> = {
  brandColorHex: "Color de marca",
  logoUrl: "Logo (/enroll)",
  walletLogoUrl: "Logo header del pase (Apple)",
  walletHeroUrl: "Hero/strip del pase (Apple)",
  googleLogoUri: "Logo (Google Wallet)",
  googleHeroUri: "Hero (Google Wallet)",
  googleWideLogoUri: "Wordmark horizontal (Google Wallet)",
};

// Vista de solo lectura para un admin viewer — a diferencia de un
// "no tienes acceso" genérico, muestra los valores REALES (pedido
// explícito: "debe poder leer... mas no editarlo"). Mismo criterio que
// LocationsReadOnlyList en page.tsx.
export function BrandingReadOnly({ branding }: { branding: Branding }) {
  const hasAnyValue = Object.values(branding).some(Boolean);

  if (!hasAnyValue) {
    return <p className="text-sm text-muted-foreground">Este negocio todavía no tiene branding configurado.</p>;
  }

  return (
    <dl className="flex flex-col divide-y rounded-lg border text-sm">
      {(Object.keys(FIELD_LABELS) as (keyof Branding)[]).map((key) => (
        <div key={key} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-muted-foreground">{FIELD_LABELS[key]}</dt>
          <dd className="flex items-center gap-2 break-all sm:max-w-xs">
            {key === "brandColorHex" && branding.brandColorHex ? (
              <span
                className="size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: branding.brandColorHex }}
                aria-hidden="true"
              />
            ) : null}
            {branding[key] ?? <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
