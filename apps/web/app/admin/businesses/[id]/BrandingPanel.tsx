"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { checkBrandColorContrast } from "../../../../lib/contrast";
import { useActionToast } from "../../../../lib/useActionToast";
import { updateBrandingAction, type AdminActionState } from "../../businesses-actions";

type Branding = {
  brandColorHex: string | null;
  logoUrl: string | null;
  walletLogoUrl: string | null;
  walletHeroUrl: string | null;
  googleLogoUri: string | null;
  googleHeroUri: string | null;
  googleWideLogoUri: string | null;
};

const initialState: AdminActionState = {};

// Vista previa 100% local — igual que CardPreviewer.tsx: el archivo se lee
// con URL.createObjectURL y JAMÁS sale del navegador, no sube nada. Sirve
// solo para que el admin verifique visualmente cómo se vería un logo
// recortado en círculo ANTES de subirlo él mismo a un host externo
// (Cloudinary u otro) y pegar la URL resultante abajo — esta app no tiene
// (ni necesita, dado el volumen real de clientes) un pipeline propio de
// subida/procesamiento de imágenes.
function LogoCirclePreview() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreviewUrl(url);
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-dashed p-3">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL local, nunca una imagen remota
        <img
          src={previewUrl}
          alt="Vista previa del logo recortado en círculo"
          className="size-16 shrink-0 rounded-full border object-cover"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground">
          Vista
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo-preview-input" className="text-sm font-medium">
          Vista previa de logo circular
        </Label>
        <p className="text-xs text-muted-foreground">Solo local — no sube nada.</p>
        <input
          id="logo-preview-input"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="text-sm"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />
      </div>
    </div>
  );
}

function ContrastWarning({ brandColorHex }: { brandColorHex: string }) {
  const check = checkBrandColorContrast(brandColorHex);
  if (!check) return null;
  if (check.passesForeground && check.passesLabel) {
    return (
      <p className="text-xs text-success">
        Contraste suficiente contra el texto fijo del pase de Apple.
      </p>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Contraste insuficiente contra el texto fijo del pase de Apple (
        {check.foregroundRatio.toFixed(1)}:1 / {check.labelRatio.toFixed(1)}:1, mínimo recomendado 4.5:1). El
        texto del pase puede verse difícil de leer sobre este color.
      </AlertDescription>
    </Alert>
  );
}

export function BrandingPanel({ businessId, branding }: { businessId: string; branding: Branding }) {
  const boundAction = updateBrandingAction.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  useActionToast(state, initialState);
  const [brandColorHex, setBrandColorHex] = useState(branding.brandColorHex ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brandColorHex">Color de marca</Label>
        <div className="flex items-center gap-2">
          <Input
            id="brandColorHex"
            name="brandColorHex"
            type="text"
            placeholder="#085AB3"
            value={brandColorHex}
            onChange={(e) => setBrandColorHex(e.currentTarget.value)}
            className="max-w-40"
          />
          {/^#?[0-9a-f]{6}$/i.test(brandColorHex) ? (
            <span
              className="size-8 shrink-0 rounded-full border"
              style={{ backgroundColor: brandColorHex.startsWith("#") ? brandColorHex : `#${brandColorHex}` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        {brandColorHex ? <ContrastWarning brandColorHex={brandColorHex} /> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logoUrl">Logo (URL pública, /enroll)</Label>
          <Input id="logoUrl" name="logoUrl" type="text" defaultValue={branding.logoUrl ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walletLogoUrl">Logo header del pase (Apple)</Label>
          <Input
            id="walletLogoUrl"
            name="walletLogoUrl"
            type="text"
            defaultValue={branding.walletLogoUrl ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="walletHeroUrl">Hero/strip del pase (Apple)</Label>
          <Input
            id="walletHeroUrl"
            name="walletHeroUrl"
            type="text"
            defaultValue={branding.walletHeroUrl ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="googleLogoUri">Logo (Google Wallet)</Label>
          <Input
            id="googleLogoUri"
            name="googleLogoUri"
            type="text"
            defaultValue={branding.googleLogoUri ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="googleHeroUri">Hero (Google Wallet)</Label>
          <Input
            id="googleHeroUri"
            name="googleHeroUri"
            type="text"
            defaultValue={branding.googleHeroUri ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="googleWideLogoUri">Wordmark horizontal (Google Wallet)</Label>
          <Input
            id="googleWideLogoUri"
            name="googleWideLogoUri"
            type="text"
            defaultValue={branding.googleWideLogoUri ?? ""}
          />
        </div>
      </div>

      <LogoCirclePreview />

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando…" : "Guardar branding"}
      </Button>
    </form>
  );
}
