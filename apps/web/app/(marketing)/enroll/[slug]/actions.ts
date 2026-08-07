"use server";

import { enrollCustomerForSlug, type EnrollActionState } from "./logic";

// businessSlug llega ya "bind"eado desde EnrollForm (server action con
// argumento parcial aplicado) — nunca de un campo de formData, para que no
// pueda mandarse un slug distinto al de la URL que el visitante realmente
// abrió.
export async function enrollCustomerAction(
  businessSlug: string,
  _prevState: EnrollActionState,
  formData: FormData,
): Promise<EnrollActionState> {
  return enrollCustomerForSlug(businessSlug, formData);
}
