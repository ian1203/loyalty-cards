import { sql } from "drizzle-orm";
import { appDb } from "./client";

// Superficie separada a propósito, mismo criterio que admin.ts/marketing.ts:
// cualquier import de "@loyalty/db/enroll" declara explícitamente que ese
// código escribe clientes SIN sesión de tenant. A diferencia de
// marketing.ts (INSERT directo con appDb porque marketing_leads no tiene
// business_id/RLS), `customers` SÍ tiene RLS tenant-scoped — un INSERT
// público directo con appDb no funcionaría (y si funcionara por un GRANT
// mal puesto, sería mucho más peligroso: cualquier request pública podría
// escribir clientes de cualquier negocio). En vez de eso, appDb solo
// invoca dos funciones Postgres `SECURITY DEFINER` (migración 0014) que
// encapsulan TODA la validación (negocio activo, resuelto por slug —
// nunca por un business_id que el cliente pudiera mandar — y el resto de
// invariantes) dentro de la función misma. app_user nunca gana permiso de
// escritura directa sobre customers/customer_balances para este camino.

export type PublicEnrollInput = {
  businessSlug: string;
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string; // YYYY-MM-DD
  occupation: string | null;
  walletToken: string;
};

export type PublicEnrollResult = {
  customerId: string;
  businessId: string;
  businessName: string;
  programName: string | null;
  stampsRequired: number | null;
};

export type PublicBusinessLookup = {
  id: string;
  name: string;
  logoUrl: string | null;
  enrollShowOccupation: boolean;
};

export class EnrollBusinessNotFoundError extends Error {
  constructor() {
    super("business_not_found");
  }
}

export class EnrollDuplicatePhoneError extends Error {
  constructor() {
    super("duplicate_phone");
  }
}

// Lookup público mínimo (nombre del negocio para el encabezado del
// formulario) — 0 filas si el slug no existe o el negocio está
// suspendido, nunca un error que sirva de oráculo de existencia.
export async function getActiveBusinessBySlug(slug: string): Promise<PublicBusinessLookup | null> {
  const result = await appDb.execute<{
    id: string;
    name: string;
    logo_url: string | null;
    enroll_show_occupation: boolean;
  }>(sql`select * from get_active_business_by_slug(${slug})`);
  const row = result.rows[0];
  return row
    ? { id: row.id, name: row.name, logoUrl: row.logo_url, enrollShowOccupation: row.enroll_show_occupation }
    : null;
}

export async function enrollCustomerPublic(input: PublicEnrollInput): Promise<PublicEnrollResult> {
  type Row = {
    customer_id: string;
    business_id: string;
    business_name: string;
    program_name: string | null;
    stamps_required: number | null;
  };

  let result: Awaited<ReturnType<typeof appDb.execute<Row>>>;
  try {
    result = await appDb.execute<Row>(
      sql`select * from enroll_customer_public(
        ${input.businessSlug},
        ${input.fullName},
        ${input.phone},
        ${input.email},
        ${input.dateOfBirth}::date,
        ${input.occupation},
        ${input.walletToken}
      )`,
    );
  } catch (error) {
    // drizzle-orm envuelve el error real de `pg` en un DrizzleQueryError —
    // el SQLSTATE (23505), el nombre del constraint y el mensaje de RAISE
    // EXCEPTION viven en `.cause`, no en el objeto de nivel superior.
    // Miramos ambos para no depender de un detalle de versión de drizzle.
    const cause = (error as { cause?: unknown }).cause;
    const code = (cause as { code?: string })?.code ?? (error as { code?: string }).code;
    const constraint =
      (cause as { constraint?: string })?.constraint ?? (error as { constraint?: string }).constraint;
    const message =
      (cause as { message?: string })?.message ?? (error as { message?: string }).message;

    // Match por nombre de constraint, no solo el SQLSTATE — customers.wallet_token
    // también es unique() (global) y en teoría podría disparar el mismo
    // 23505 (astronómicamente improbable con randomBytes(24), pero el
    // mensaje de error no debería mentir si algún día ocurre).
    if (code === "23505" && constraint === "customers_business_id_phone_key") {
      throw new EnrollDuplicatePhoneError();
    }
    if (message?.includes("business_not_found")) {
      throw new EnrollBusinessNotFoundError();
    }
    throw error;
  }

  const row = result.rows[0];
  if (!row) {
    throw new EnrollBusinessNotFoundError();
  }

  return {
    customerId: row.customer_id,
    businessId: row.business_id,
    businessName: row.business_name,
    programName: row.program_name,
    stampsRequired: row.stamps_required,
  };
}
