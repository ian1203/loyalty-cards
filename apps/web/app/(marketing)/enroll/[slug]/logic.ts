// Sin "use server" a propósito, mismo patrón que el resto de logic.ts de
// este repo (ver frontend-conventions): la lógica vive acá, actions.ts es
// el shim "use server". No hay sesión que resolver — es un registro
// público sin tenant — pero mantener el split evita que este archivo quede
// invocable directo como endpoint y facilita testearlo sin un Request real.
import { randomBytes } from "node:crypto";
import {
  EnrollBusinessNotFoundError,
  EnrollDuplicatePhoneError,
  enrollCustomerPublic,
} from "@loyalty/db/enroll";
import { buildWalletArtifactsForNewEnrollment } from "../../../../lib/wallet/publicEnrollWallet";

export type EnrollActionState = {
  error?: string;
  success?: {
    businessName: string;
    programName: string | null;
    appleWalletDownloadUrl: string | null;
    googleSaveLink: string | null;
  };
};

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_OCCUPATION_LENGTH = 120;
// TLD de al menos 2 caracteres, sin punto vacío antes/después — el regex
// anterior (sin el {2,}) dejaba pasar cosas como "a@b.c" o "a@.com".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_DIGITS_RE = /^\d{10}$/;

// El negocio opera con clientes en México — un teléfono real siempre es un
// número local de 10 dígitos. Acepta espacios/guiones/paréntesis y un "52"
// o "+52" de código de país opcional (el placeholder del form lo sugiere),
// pero SIEMPRE normaliza a los 10 dígitos puros antes de guardar — mismo
// criterio que walletToken: el dato que se persiste es el mínimo
// consistente, no lo que el usuario tecleó tal cual.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("52")) {
    digits = digits.slice(2);
  }
  return PHONE_DIGITS_RE.test(digits) ? digits : null;
}

// Gate de mayoría de edad SOLO para este flujo de auto-registro: el
// checkbox de consentimiento LFPDPPP lo firma el propio titular de los
// datos, y un menor no puede dar ese consentimiento por sí mismo. El alta
// manual desde /customers (dueño/staff actuando como responsable) no tiene
// este gate — ahí el consentimiento no depende del propio cliente.
const MIN_SELF_ENROLL_AGE = 18;
const MAX_REASONABLE_AGE = 110;

function calculateAge(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export async function enrollCustomerForSlug(
  businessSlug: string,
  formData: FormData,
): Promise<EnrollActionState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  if (!firstName || firstName.length > MAX_NAME_LENGTH) {
    return { error: "Ingresa tu nombre." };
  }

  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!lastName || lastName.length > MAX_NAME_LENGTH) {
    return { error: "Ingresa tu apellido." };
  }

  const rawDob = String(formData.get("dateOfBirth") ?? "").trim();
  const dob = rawDob ? new Date(`${rawDob}T00:00:00Z`) : null;
  if (!rawDob || !dob || Number.isNaN(dob.getTime())) {
    return { error: "Ingresa tu fecha de nacimiento." };
  }
  const now = new Date();
  if (dob.getTime() > now.getTime()) {
    return { error: "La fecha de nacimiento no puede ser en el futuro." };
  }
  const age = calculateAge(dob, now);
  if (age > MAX_REASONABLE_AGE) {
    return { error: "Revisa tu fecha de nacimiento." };
  }
  if (age < MIN_SELF_ENROLL_AGE) {
    return {
      error:
        "Debes ser mayor de edad para registrarte tú mismo — pide a un empleado que te ayude a registrarte en el mostrador.",
    };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { error: "Ingresa un correo electrónico válido (ejemplo: nombre@dominio.com)." };
  }

  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { error: "Ingresa tu teléfono a 10 dígitos (ejemplo: 2294821234)." };
  }

  const rawOccupation = String(formData.get("occupation") ?? "").trim();
  const occupation = rawOccupation ? rawOccupation.slice(0, MAX_OCCUPATION_LENGTH) : null;

  if (formData.get("consent") !== "on") {
    return { error: "Debes aceptar el aviso de privacidad para continuar." };
  }

  // Token opaco del QR/Wallet — mismo patrón que customers.walletToken en
  // el alta manual (randomBytes(24).base64url), nunca datos del cliente
  // adentro.
  const walletToken = randomBytes(24).toString("base64url");

  let enrollResult;
  try {
    enrollResult = await enrollCustomerPublic({
      businessSlug,
      fullName: `${firstName} ${lastName}`,
      phone,
      email,
      dateOfBirth: rawDob,
      occupation,
      walletToken,
    });
  } catch (error) {
    if (error instanceof EnrollDuplicatePhoneError) {
      return {
        error: "Ya existe un registro con ese teléfono en este negocio. Si es tuyo, pide tu tarjeta al personal.",
      };
    }
    if (error instanceof EnrollBusinessNotFoundError) {
      return { error: "No pudimos encontrar este negocio. Verifica el enlace." };
    }
    console.error("enrollCustomerForSlug:", error);
    return { error: "No se pudo completar tu registro. Intenta de nuevo." };
  }

  // El alta de negocio ya confirmó en este punto (customer + balance
  // inicial en 0 ya existen) — un fallo generando el .pkpass/link de
  // Wallet no debe perderse ese alta ni mostrarse como error de registro:
  // mismo criterio best-effort que notifyWalletOfTransaction. El personal
  // puede entregar el pase después desde /customers/{id}/wallet.
  let wallet: { appleWalletDownloadUrl: string | null; googleSaveLink: string | null } = {
    appleWalletDownloadUrl: null,
    googleSaveLink: null,
  };
  try {
    wallet = await buildWalletArtifactsForNewEnrollment(enrollResult.businessId, enrollResult.customerId);
  } catch (error) {
    console.error("buildWalletArtifactsForNewEnrollment:", error);
  }

  return {
    success: {
      businessName: enrollResult.businessName,
      programName: enrollResult.programName,
      appleWalletDownloadUrl: wallet.appleWalletDownloadUrl,
      googleSaveLink: wallet.googleSaveLink,
    },
  };
}
