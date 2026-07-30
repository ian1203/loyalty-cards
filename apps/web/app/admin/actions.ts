"use server";

import { createBusinessWithOwner } from "@loyalty/db/admin";
import { requirePlatformAdmin } from "../../lib/supabase/session";
import { createAdminClient } from "../../lib/supabase/server";
import { slugify } from "../../lib/slugify";

export type CreateBusinessState = {
  error?: string;
  success?: { businessName: string; ownerEmail: string };
};

// Camino confinado y auditado para que el admin general dé de alta un
// negocio + su dueño. La escritura en DB (createBusinessWithOwner) usa
// exclusivamente adminDb (nunca app_user/withTenantContext — al crear un
// negocio no existe todavía ningún business_id al que fijar contexto de
// tenant). El primer chequeo, antes de tocar cualquier dato, es
// requirePlatformAdmin(): si falla, esta función corta ahí — un Server
// Action es invocable directamente como endpoint, así que el gate tiene que
// vivir AQUÍ, no solo en la página que renderiza el formulario.
export async function createBusinessAction(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return { error: "No autorizado." };
  }

  const businessName = String(formData.get("businessName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();

  if (!businessName || !ownerEmail) {
    return { error: "Nombre del negocio y email del dueño son obligatorios." };
  }

  const slug = slugify(businessName);
  if (!slug) {
    return { error: "El nombre del negocio no genera un slug válido." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { error: "NEXT_PUBLIC_SITE_URL no está configurado." };
  }

  const supabaseAdmin = createAdminClient();
  // Directo a /set-password, NO a /auth/callback: el link de invitación por
  // email usa el flujo implícito de Supabase (tokens en el fragmento de la
  // URL), no PKCE — no hay code que un route handler pueda intercambiar. Ver
  // el comentario en set-password/page.tsx.
  const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(ownerEmail, {
    redirectTo: `${siteUrl}/set-password`,
  });

  if (invite.error || !invite.data.user) {
    return { error: `No se pudo invitar al dueño: ${invite.error?.message ?? "error desconocido"}` };
  }

  const authUserId = invite.data.user.id;

  try {
    await createBusinessWithOwner({
      businessName,
      slug,
      ownerEmail,
      ownerAuthUserId: authUserId,
      createdByAuthUserId: admin.authUserId,
    });

    return { success: { businessName, ownerEmail } };
  } catch (error) {
    // La invitación en auth.users ya se creó — si el resto falla, no la
    // dejamos huérfana (sin negocio ni fila en users).
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {
      // Best-effort: si ni siquiera esto funciona, queda un auth.users
      // huérfano visible en Studio para limpieza manual — no hay nada más
      // seguro que hacer aquí sin una cola de compensación real.
    });

    const message = error instanceof Error ? error.message : "error desconocido";
    return { error: `No se pudo crear el negocio: ${message}` };
  }
}
