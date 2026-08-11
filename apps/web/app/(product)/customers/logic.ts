// OJO: este archivo NO lleva "use server" a propósito. En un archivo
// "use server" TODO export async se convierte en un endpoint invocable
// desde el cliente — y estas funciones reciben la sesión como parámetro,
// así que exponerlas permitiría invocarlas con una sesión forjada. Solo
// actions.ts (que resuelve la sesión desde las cookies verificadas) las
// llama. Los tests de Paso 5 también, con sesiones reales producidas por
// getVerifiedSession().
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  customerBalances,
  customers,
  loyaltyPrograms,
  withTenantContext,
  type TenantTransaction,
} from "@loyalty/db";
import { resolveActor, writeAuditLog, type TenantSession } from "../../../lib/tenant";

export type CustomerActionState = {
  error?: string;
  success?: string;
};

const SEARCH_LIMIT = 50;

// Búsqueda del directorio — el MISMO código que usa la página (y el test de
// no-fuga del Paso 5). `q` es input del cliente y se usa SOLO como filtro
// dentro del tenant (parametrizado, comodines de LIKE escapados) — el
// business_id sale exclusivamente de la sesión. Proyección explícita SIN
// wallet_token (hallazgo de la revisión de seguridad): la UI no lo necesita
// y así un refactor futuro que pase estas filas a un Client Component no
// puede exponer el token opaco por accidente.
export async function searchCustomers(
  tx: TenantTransaction,
  session: TenantSession,
  rawQ: string,
) {
  const q = rawQ.trim().slice(0, 100);
  const escaped = q.replace(/[\\%_]/g, (match) => `\\${match}`);
  const pattern = `%${escaped}%`;

  return tx
    .select({
      id: customers.id,
      businessId: customers.businessId,
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, session.businessId),
        q
          ? or(
              ilike(customers.fullName, pattern),
              ilike(customers.phone, pattern),
              ilike(customers.email, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(desc(customers.createdAt))
    .limit(SEARCH_LIMIT);
}

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const PHONE_RE = /^[+0-9][0-9 ()-]{4,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class DuplicateCustomerError extends Error {
  constructor(readonly field: "teléfono" | "email") {
    super(`duplicate ${field}`);
  }
}

// Alta manual de cliente: la hace el dueño/admin — staff quedó rebotado de
// TODO /customers (directorio administrativo, ver customers/page.tsx),
// consistente con el modelo "staff = solo /scanner" (auditoría RBAC).
// Crea el cliente + su balance inicial de sellos (0, contra el programa
// activo si existe) + audit log, todo en la misma transacción tenant-scoped.
export async function createCustomerForSession(
  session: TenantSession | null,
  formData: FormData,
): Promise<CustomerActionState> {
  if (!session) {
    return { error: "No autorizado." };
  }
  if (session.role === "staff") {
    return { error: "No autorizado." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName || fullName.length > MAX_NAME_LENGTH) {
    return { error: "El nombre del cliente es obligatorio (máx. 120 caracteres)." };
  }

  const rawPhone = String(formData.get("phone") ?? "").trim();
  if (rawPhone && !PHONE_RE.test(rawPhone)) {
    return { error: "El teléfono no tiene un formato válido." };
  }
  const phone = rawPhone || null;

  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (rawEmail && (rawEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(rawEmail))) {
    return { error: "El email no tiene un formato válido." };
  }
  const email = rawEmail || null;

  try {
    await withTenantContext(session.businessId, async (tx) => {
      const actor = await resolveActor(tx, session);

      // Dedupe a nivel app: mismo phone o email dentro DEL TENANT rechaza
      // con mensaje claro ANTES de llegar al INSERT — cortesía de UX, no la
      // garantía real. La garantía real son los unique index parciales de
      // customers (customers_business_id_phone_key/_email_key, WHERE ...
      // IS NOT NULL): dos altas casi simultáneas del mismo phone/email
      // (doble clic, reintento de red) pueden ambas pasar este SELECT antes
      // de que cualquiera confirme su INSERT — el catch de abajo traduce
      // esa violación de constraint (23505) al mismo DuplicateCustomerError,
      // mismo patrón que enrollCustomerPublic (packages/db/src/enroll.ts).
      if (phone) {
        const [dup] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, session.businessId),
              eq(customers.phone, phone),
            ),
          )
          .limit(1);
        if (dup) throw new DuplicateCustomerError("teléfono");
      }
      if (email) {
        const [dup] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, session.businessId),
              eq(customers.email, email),
            ),
          )
          .limit(1);
        if (dup) throw new DuplicateCustomerError("email");
      }

      // Token opaco para el futuro pase de Wallet/QR: aleatorio, sin ningún
      // dato del cliente adentro (regla de CLAUDE.md).
      const walletToken = randomBytes(24).toString("base64url");

      const [customer] = await tx
        .insert(customers)
        .values({
          businessId: session.businessId,
          fullName,
          phone,
          email,
          walletToken,
        })
        .returning();

      const [program] = await tx
        .select()
        .from(loyaltyPrograms)
        .where(
          and(
            eq(loyaltyPrograms.businessId, session.businessId),
            eq(loyaltyPrograms.isActive, true),
          ),
        )
        .orderBy(asc(loyaltyPrograms.createdAt))
        .limit(1);

      if (program) {
        await tx.insert(customerBalances).values({
          businessId: session.businessId,
          customerId: customer.id,
          loyaltyProgramId: program.id,
          // currentStamps: 0 por default del esquema
        });
      }

      await writeAuditLog(tx, session, actor.id, {
        action: "customer.created",
        entityType: "customer",
        entityId: customer.id,
        metadata: { fullName, withBalance: Boolean(program) },
      });
    });
  } catch (error) {
    if (error instanceof DuplicateCustomerError) {
      return { error: `Ya existe un cliente con ese ${error.field} en tu negocio.` };
    }

    // Backstop real de la carrera SELECT-antes-de-INSERT de arriba: drizzle
    // envuelve el error de `pg` en un DrizzleQueryError — el SQLSTATE y el
    // nombre del constraint viven en `.cause`, no en el objeto de nivel
    // superior (mismo desempaquetado que enrollCustomerPublic).
    const cause = (error as { cause?: unknown }).cause;
    const code = (cause as { code?: string })?.code ?? (error as { code?: string }).code;
    const constraint =
      (cause as { constraint?: string })?.constraint ?? (error as { constraint?: string }).constraint;
    if (code === "23505" && constraint === "customers_business_id_phone_key") {
      return { error: "Ya existe un cliente con ese teléfono en tu negocio." };
    }
    if (code === "23505" && constraint === "customers_business_id_email_key") {
      return { error: "Ya existe un cliente con ese email en tu negocio." };
    }

    console.error("createCustomerForSession:", error);
    return { error: "No se pudo dar de alta el cliente. Intenta de nuevo." };
  }

  return { success: `Cliente "${fullName}" dado de alta.` };
}
