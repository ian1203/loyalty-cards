"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUpIcon, XIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { WalletCardMockup } from "./WalletCardMockup";
import { buildWhatsappLink } from "../../../lib/marketing/content";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — un logo no necesita más.
const DEFAULT_ACCENT = "#E8573F";

function readErrorFor(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Formato no soportado. Usa PNG, JPG o SVG.";
  }
  if (file.size > MAX_BYTES) {
    return "El archivo pesa más de 2 MB. Usa una versión más ligera de tu logo.";
  }
  return null;
}

// Widget 100% client-side: el logo se lee con FileReader/object URL y
// jamás sale del navegador (ninguna Server Action, ningún fetch a un
// endpoint propio) — ver brief. Reusa <WalletCardMockup>, el mismo
// componente del hero, en vez de duplicar el marcado del pase.
export function CardPreviewer() {
  const [businessName, setBusinessName] = useState("");
  const [rewardLabel, setRewardLabel] = useState("");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [logoSrc, setLogoSrc] = useState<string | undefined>(undefined);
  const [fileError, setFileError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // El object URL apunta a memoria del navegador — hay que liberarlo al
  // reemplazar el logo o al desmontar, o se queda retenido indefinidamente.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const error = readErrorFor(file);
    if (error) {
      setFileError(error);
      return;
    }
    setFileError(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setLogoSrc(url);
  }

  function clearLogo() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLogoSrc(undefined);
    setFileError(null);
  }

  const demoLink = buildWhatsappLink(
    businessName.trim()
      ? `Hola, así se vería la tarjeta de "${businessName.trim()}" en Wallet. ¿Agendamos una demo de 10 minutos?`
      : undefined,
  );

  return (
    <section className="border-t bg-muted/20">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Previsualiza tu tarjeta</h2>
          <p className="mt-3 text-muted-foreground">
            Escribe el nombre de tu negocio y sube tu logo. Así se vería tu tarjeta de sellos en Apple Wallet o
            Google Wallet.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
          <form className="mx-auto flex w-full max-w-sm flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-business-name">Nombre de tu negocio</Label>
              <Input
                id="preview-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.currentTarget.value)}
                maxLength={40}
                placeholder="Cafetería El Puerto"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-logo">Logo (PNG, JPG o SVG, hasta 2 MB)</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="press"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageUpIcon className="size-4" aria-hidden="true" />
                  {logoSrc ? "Cambiar logo" : "Subir logo"}
                </Button>
                {logoSrc ? (
                  <Button type="button" variant="ghost" size="sm" className="press" onClick={clearLogo}>
                    <XIcon className="size-4" aria-hidden="true" />
                    Quitar
                  </Button>
                ) : null}
              </div>
              {/* Sin <label htmlFor> propio a propósito: el <Label> de arriba ya
                  describe este campo — un segundo label asociado duplicaría el
                  nombre accesible del input ("Logo... Subir logo" concatenados).
                  El botón dispara el click del input vía ref en su lugar. */}
              <input
                id="preview-logo"
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => handleFile(e.currentTarget.files?.[0])}
              />
              {fileError ? (
                <p role="alert" className="text-xs text-destructive">
                  {fileError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Tu logo nunca se sube ni se guarda: solo vive en tu navegador.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-reward">Texto de recompensa (opcional)</Label>
              <Input
                id="preview-reward"
                value={rewardLabel}
                onChange={(e) => setRewardLabel(e.currentTarget.value)}
                maxLength={30}
                placeholder="Café gratis"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-accent">Color de acento (opcional)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="preview-accent"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.currentTarget.value)}
                  className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
                  aria-label="Color de acento de tu tarjeta"
                />
                <span className="font-mono text-xs text-muted-foreground uppercase">{accentColor}</span>
              </div>
            </div>
          </form>

          {/* w-full (no mx-auto) + min-w-0: con mx-auto, un item de grid con
              márgenes automáticos en los dos lados se dimensiona por
              fit-content en vez de estirarse a la celda (spec de CSS Box
              Alignment) — con el max-w-sm de WalletCardMockup como
              fit-content, eso desborda la página en mobile. w-full fuerza el
              stretch real; los hijos se siguen centrando con items-center.
              Hallazgo real de esta revisión con Playwright mobile,
              preexistente a este cambio. */}
          <div className="flex w-full min-w-0 flex-col items-center gap-6">
            <WalletCardMockup
              businessName={businessName.trim() || "Tu negocio"}
              rewardLabel={rewardLabel.trim() || "Tu recompensa"}
              accentColor={accentColor}
              logoSrc={logoSrc}
              stampsFilled={6}
              stampsRequired={10}
            />
            <Button asChild size="lg" className="press">
              <a href={demoLink} target="_blank" rel="noopener noreferrer">
                ¿Te gustó cómo se vería? Agenda una demo
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
