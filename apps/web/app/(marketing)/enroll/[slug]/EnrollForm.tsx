"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AppleWalletBadge } from "../../../../components/AppleWalletBadge";
import { Button } from "../../../../components/ui/button";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { enrollCustomerAction } from "./actions";
import type { EnrollActionState } from "./logic";

const initialState: EnrollActionState = {};

function detectWalletPlatform(): "apple" | "google" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "apple";
  if (/Android/i.test(ua)) return "google";
  return "other";
}

// Botón exclusivo por dispositivo: solo uno se muestra, nunca los dos
// lado a lado. Si el wallet "nativo" del dispositivo detectado no está
// disponible (ej. iPhone pero Apple falló al generarse) o el userAgent es
// ambiguo, cae al que SÍ esté disponible — Google primero por default
// (ya es el que funciona en prod) — para nunca dejar al cliente sin
// ningún botón si al menos uno de los dos existe.
function pickWalletButton(
  platform: "apple" | "google" | "other",
  hasApple: boolean,
  hasGoogle: boolean,
): "apple" | "google" | null {
  if (platform === "apple" && hasApple) return "apple";
  if (platform === "google" && hasGoogle) return "google";
  if (hasGoogle) return "google";
  if (hasApple) return "apple";
  return null;
}

export function EnrollForm({ businessSlug }: { businessSlug: string }) {
  const enrollForSlug = enrollCustomerAction.bind(null, businessSlug);
  const [state, formAction, pending] = useActionState(enrollForSlug, initialState);

  // Inputs controlados a propósito: React resetea el <form> tras CADA
  // envío de una form action, incluso cuando la action devuelve
  // {error: ...} en vez de lanzar (para React, "no lanzó" = "se completó",
  // y limpia los campos no controlados) — sin esto, un error de validación
  // puntual (ej. teléfono mal) borraba todo lo demás que el cliente ya
  // había escrito. Con value+onChange, React reafirma el valor en el
  // siguiente render y el reset nativo del DOM queda sin efecto.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [occupation, setOccupation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);

  if (state.success) {
    return <EnrollConfirmation success={state.success} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-token-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-first-name">Nombre</Label>
          <Input
            id="enroll-first-name"
            name="firstName"
            maxLength={80}
            placeholder="Tu nombre"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-last-name">Apellido</Label>
          <Input
            id="enroll-last-name"
            name="lastName"
            maxLength={80}
            placeholder="Tu apellido"
            required
            value={lastName}
            onChange={(e) => setLastName(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-dob">Fecha de nacimiento</Label>
          <Input
            id="enroll-dob"
            name="dateOfBirth"
            type="date"
            required
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-occupation">Ocupación (opcional)</Label>
          <Input
            id="enroll-occupation"
            name="occupation"
            maxLength={120}
            placeholder="Estudiante"
            value={occupation}
            onChange={(e) => setOccupation(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-email">Correo</Label>
          <Input
            id="enroll-email"
            name="email"
            type="email"
            maxLength={254}
            placeholder="tu@correo.com"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-phone">Teléfono / WhatsApp</Label>
          <Input
            id="enroll-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            maxLength={20}
            placeholder="10 dígitos, ej. 2291234567"
            required
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="enroll-consent"
          name="consent"
          required
          className="mt-0.5"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
        />
        <Label htmlFor="enroll-consent" className="text-sm font-normal leading-snug text-muted-foreground">
          Acepto que este negocio use mis datos para operar mi tarjeta de lealtad, conforme a su{" "}
          <Link href="/privacidad" target="_blank" className="text-foreground underline">
            aviso de privacidad
          </Link>
          . El negocio es responsable de mis datos; Pragmia los trata solo como encargado, para emitir y
          actualizar la tarjeta.
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrarme"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function EnrollConfirmation({ success }: { success: NonNullable<EnrollActionState["success"]> }) {
  const platform = detectWalletPlatform();
  const hasApple = Boolean(success.appleWalletDownloadUrl);
  const hasGoogle = Boolean(success.googleSaveLink);
  const walletToShow = pickWalletButton(platform, hasApple, hasGoogle);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-token-sm">
      <p className="text-lg font-semibold">¡Gracias por unirte a {success.businessName}!</p>
      {success.programName ? (
        <p className="text-sm text-muted-foreground">
          Tu tarjeta &quot;{success.programName}&quot; empieza en 0 sellos — agrégala a tu celular para no
          perderla.
        </p>
      ) : null}

      {!walletToShow ? (
        <p className="text-sm text-muted-foreground" role="status">
          Tu registro quedó guardado. Pide al personal que te ayude a agregar tu tarjeta a Wallet.
        </p>
      ) : (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-sm font-medium">Agrega tu tarjeta a tu wallet 👇</p>
          {walletToShow === "apple" ? (
            <AppleWalletBadge href={success.appleWalletDownloadUrl!} />
          ) : (
            <Button asChild className="w-full sm:w-auto">
              <a href={success.googleSaveLink!}>Agregar a Google Wallet</a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
