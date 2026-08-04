import { insertMarketingLead } from "@loyalty/db/marketing";

// Sin "use server" a propósito, mismo patrón que logic.ts en el resto de
// features (ver frontend-conventions): la lógica vive acá, actions.ts es
// el shim "use server". Acá no hay sesión que resolver (es un formulario
// público, sin tenant), pero mantener el split evita que este archivo
// quede invocable directo como endpoint y facilita testear la validación
// sin pasar por un Request real.
export type LeadActionState = { error?: string; success?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitMarketingLead(formData: FormData): Promise<LeadActionState> {
  const contactName = String(formData.get("contactName") ?? "").trim();
  const businessName = String(formData.get("businessName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const messageRaw = String(formData.get("message") ?? "").trim();

  if (!contactName || contactName.length > 120) {
    return { error: "Ingresa tu nombre." };
  }
  if (!businessName || businessName.length > 120) {
    return { error: "Ingresa el nombre de tu negocio." };
  }
  if (!phone || phone.length > 20) {
    return { error: "Ingresa un teléfono de contacto." };
  }

  const email = emailRaw.length > 0 ? emailRaw : null;
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
    return { error: "El correo no es válido." };
  }

  const message = messageRaw.length > 0 ? messageRaw.slice(0, 1000) : null;

  await insertMarketingLead({ contactName, businessName, phone, email, message });

  return { success: "¡Gracias! Te contactaremos pronto para agendar tu demo." };
}
