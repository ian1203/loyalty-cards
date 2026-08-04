"use server";

import { submitMarketingLead, type LeadActionState } from "./lib/leadLogic";

export async function submitMarketingLeadAction(
  _prevState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  return submitMarketingLead(formData);
}
