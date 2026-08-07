"use client";

import Link from "next/link";
import { useActionState } from "react";
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

export function EnrollForm({ businessSlug }: { businessSlug: string }) {
  const enrollForSlug = enrollCustomerAction.bind(null, businessSlug);
  const [state, formAction, pending] = useActionState(enrollForSlug, initialState);

  if (state.success) {
    return <EnrollConfirmation success={state.success} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-token-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-first-name">Nombre</Label>
          <Input id="enroll-first-name" name="firstName" maxLength={80} placeholder="Enrique" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-last-name">Apellido</Label>
          <Input id="enroll-last-name" name="lastName" maxLength={80} placeholder="Hernández" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-dob">Fecha de nacimiento</Label>
          <Input id="enroll-dob" name="dateOfBirth" type="date" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-occupation">Ocupación (opcional)</Label>
          <Input id="enroll-occupation" name="occupation" maxLength={120} placeholder="Estudiante" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-email">Correo</Label>
          <Input id="enroll-email" name="email" type="email" maxLength={254} placeholder="tu@correo.com" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-phone">Teléfono / WhatsApp</Label>
          <Input id="enroll-phone" name="phone" type="tel" maxLength={20} placeholder="+52 229 000 0000" required />
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox id="enroll-consent" name="consent" required className="mt-0.5" />
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
  const hasApple = Boolean(success.applePkpassBase64);
  const hasGoogle = Boolean(success.googleSaveLink);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-token-sm">
      <p className="text-lg font-semibold">¡Listo! Ya eres parte de {success.businessName}</p>
      {success.programName ? (
        <p className="text-sm text-muted-foreground">
          Tu tarjeta &quot;{success.programName}&quot; empieza en 0 sellos — agrégala a tu celular para no
          perderla.
        </p>
      ) : null}

      {!hasApple && !hasGoogle ? (
        <p className="text-sm text-muted-foreground" role="status">
          Tu registro quedó guardado. Pide al personal que te ayude a agregar tu tarjeta a Wallet.
        </p>
      ) : (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {hasApple ? (
            <Button
              asChild
              variant={platform === "apple" ? "default" : "outline"}
              className="w-full sm:w-auto"
            >
              <a
                href={`data:application/vnd.apple.pkpass;base64,${success.applePkpassBase64}`}
                download="tarjeta.pkpass"
              >
                Agregar a Apple Wallet
              </a>
            </Button>
          ) : null}
          {hasGoogle ? (
            <Button
              asChild
              variant={platform === "google" ? "default" : "outline"}
              className="w-full sm:w-auto"
            >
              <a href={success.googleSaveLink!}>Agregar a Google Wallet</a>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
