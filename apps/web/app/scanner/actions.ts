"use server";

import { withTenantContext } from "@loyalty/db";
import { requireTenantSession } from "../../lib/supabase/session";
import { searchCustomers } from "../customers/logic";
import {
  lookupCustomerByIdForSession,
  lookupCustomerByTokenForSession,
  redeemRewardForSession,
  registerStampForSession,
  type RedeemInput,
  type ScannerResult,
  type StampInput,
} from "./logic";

// Shims delgados (mismo patrón que /rewards y /customers): resuelven la
// sesión desde cookies verificadas y delegan en logic.ts. El gate completo
// corre en cada invocación por wire. Sin revalidatePath: el scanner maneja
// su estado en cliente a partir de la respuesta.

export async function lookupCustomerAction(rawToken: string): Promise<ScannerResult> {
  const session = await requireTenantSession();
  return lookupCustomerByTokenForSession(session, String(rawToken ?? ""));
}

export async function lookupCustomerByIdAction(
  customerId: string,
): Promise<ScannerResult> {
  const session = await requireTenantSession();
  return lookupCustomerByIdForSession(session, String(customerId ?? ""));
}

export async function registerStampAction(input: StampInput): Promise<ScannerResult> {
  const session = await requireTenantSession();
  return registerStampForSession(session, input);
}

export async function redeemRewardAction(input: RedeemInput): Promise<ScannerResult> {
  const session = await requireTenantSession();
  return redeemRewardForSession(session, input);
}

export type ScannerSearchRow = {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
};

// Búsqueda manual (fallback del escaneo): reutiliza EXACTAMENTE el mismo
// searchCustomers tenant-scoped de /customers.
export async function searchCustomersForScannerAction(
  q: string,
): Promise<{ rows: ScannerSearchRow[] } | { error: string }> {
  const session = await requireTenantSession();
  if (!session) {
    return { error: "No autorizado." };
  }
  try {
    const rows = await withTenantContext(session.businessId, (tx) =>
      searchCustomers(tx, session, String(q ?? "")),
    );
    return {
      rows: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
      })),
    };
  } catch (error) {
    console.error("searchCustomersForScannerAction:", error);
    return { error: "No se pudo buscar. Intenta de nuevo." };
  }
}
