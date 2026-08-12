"use server";

import { headers } from "next/headers";
import { resolveClientIp } from "../../../../lib/clientIp";
import { enrollCustomerForSlug, type EnrollActionState } from "./logic";

// businessSlug llega ya "bind"eado desde EnrollForm (server action con
// argumento parcial aplicado) — nunca de un campo de formData, para que no
// pueda mandarse un slug distinto al de la URL que el visitante realmente
// abrió. headers() SOLO se puede leer acá (archivo "use server") — logic.ts
// sigue sin acceso a request/headers a propósito (mismo patrón que el
// resto del repo), así que la IP se resuelve acá y se pasa como argumento.
export async function enrollCustomerAction(
  businessSlug: string,
  _prevState: EnrollActionState,
  formData: FormData,
): Promise<EnrollActionState> {
  const clientIp = resolveClientIp(await headers());
  return enrollCustomerForSlug(businessSlug, formData, clientIp);
}
