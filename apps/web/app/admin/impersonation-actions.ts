"use server";

import { redirect } from "next/navigation";
import { getVerifiedSession, requirePlatformAdmin } from "../../lib/supabase/session";
import { endImpersonation, startImpersonation } from "./impersonation";

export type ImpersonationActionState = { error?: string };

// Invocada desde la página de detalle de negocio en /admin, bind()eada con
// el businessId — mismo motivo que enrollCustomerAction.bind(null, slug):
// el destino no puede venir de un campo de formulario que un cliente
// pudiera alterar. requirePlatformAdmin() (no solo ocultar el botón en la
// UI) es el gate real — un Server Action es invocable directamente como
// endpoint.
export async function startImpersonationAction(
  businessId: string,
  _prevState: ImpersonationActionState,
  _formData: FormData,
): Promise<ImpersonationActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return { error: "No autorizado." };
  }

  await startImpersonation(admin.authUserId, admin.platformRole, businessId);
  redirect("/dashboard");
}

// Invocada desde el banner de impersonación (visible SOLO al admin que
// impersona — ver ImpersonationBanner) como action de un <form> sin
// useActionState (un botón "Salir", sin campos ni estado que mostrar) —
// por eso devuelve void, no un estado: la prop `action` de <form> exige
// (formData) => void | Promise<void> en ese modo. Mientras impersona, el
// admin ya no resuelve como kind "platform_admin" (getVerifiedSession lo
// devuelve como tenant_user del negocio impersonado — ver esa función) —
// su identidad real de plataforma se recupera de session.impersonation,
// el único lugar que la conserva. Si por algún motivo no hay impersonación
// activa (banner obsoleto en un render viejo), lanza — no hay ningún
// estado de error útil que mostrar en un banner que ya no debería existir.
export async function endImpersonationAction(): Promise<void> {
  const session = await getVerifiedSession();
  if (!session.authenticated || session.kind !== "tenant_user" || !session.impersonation) {
    throw new Error("No hay ninguna sesión de impersonación activa.");
  }

  await endImpersonation(session.impersonation.byPlatformAdminAuthUserId);
  redirect("/admin");
}
