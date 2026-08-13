// OJO: este archivo NO lleva "use server" a propósito. En un archivo
// "use server" TODO export async se convierte en un endpoint invocable
// desde el cliente — y estas funciones reciben la sesión como parámetro,
// así que exponerlas permitiría invocarlas con una sesión forjada. Solo
// actions.ts (que resuelve la sesión desde las cookies verificadas) las
// llama. Los tests de Paso 5 también, con sesiones reales producidas por
// getVerifiedSession().
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import {
  customerBalances,
  customers,
  loyaltyPrograms,
  withTenantContext,
  type TenantTransaction,
} from "@loyalty/db";
import { checkRateLimit } from "../../../lib/rateLimit";
import { resolveActor, writeAuditLog, type TenantSession } from "../../../lib/tenant";

export type CustomerActionState = {
  error?: string;
  success?: string;
};

// Paginación real (LIMIT/OFFSET) — suficiente para el volumen actual y
// esperado a corto plazo, sin keyset/cursor (no se necesita esa
// complejidad todavía). El tamaño de página es elegido por el dueño en la
// UI y vive solo en el query string (?pageSize=), nunca en DB: no es una
// preferencia crítica que valga la pena persistir por usuario.
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export function parsePageSize(raw: string | undefined): PageSize {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// pageSize acá es un number llano, no el literal PageSize — la UI/rutas
// solo pueden pedir 25/50/100 (validado en parsePageSize, la frontera real
// con input no confiable), pero estas funciones internas no tienen por qué
// heredar esa restricción (útil también para tests con páginas chicas).
export type PaginationParams = { page: number; pageSize: number };

// WHERE compartido entre searchCustomers (filas) y countCustomers (total) —
// un solo lugar para la semántica de "match exacto, tenant-scoped", para
// que ambas queries respondan sobre exactamente el mismo conjunto
// filtrado (el total de páginas debe salir de los resultados de la
// búsqueda, no del total sin filtrar del negocio).
function customerSearchWhere(session: TenantSession, q: string) {
  const qLower = q.toLowerCase();
  return and(
    eq(customers.businessId, session.businessId),
    q
      ? or(
          eq(sql`lower(${customers.fullName})`, qLower),
          eq(sql`lower(${customers.phone})`, qLower),
          eq(sql`lower(${customers.email})`, qLower),
        )
      : undefined,
  );
}

// Búsqueda del directorio — el MISMO código que usa la página (y el test de
// no-fuga del Paso 5). `q` es input del cliente y se usa SOLO como filtro
// dentro del tenant — el business_id sale exclusivamente de la sesión.
// Match EXACTO (case-insensitive), no parcial (hallazgo de endurecimiento
// de seguridad: ILIKE con comodines es una superficie de enumeración sin
// rate limit agresivo previo) — lower() en ambos lados en vez de ILIKE sin
// comodines, para que la semántica de "exacto" quede inequívoca en el
// código y un futuro `%${q}%` no reintroduzca el hueco en silencio.
// Tradeoff real, no un bug: "Mari" ya no encuentra "María González".
// Proyección explícita SIN wallet_token (hallazgo de la revisión de
// seguridad): la UI no lo necesita y así un refactor futuro que pase estas
// filas a un Client Component no puede exponer el token opaco por accidente.
//
// pagination es opcional (default página 1 / DEFAULT_PAGE_SIZE) para no
// romper los callers existentes (tests de Fase 2 que llaman con 3
// argumentos posicionales).
export async function searchCustomers(
  tx: TenantTransaction,
  session: TenantSession,
  rawQ: string,
  pagination: PaginationParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE },
) {
  const q = rawQ.trim().slice(0, 100);
  const offset = (pagination.page - 1) * pagination.pageSize;

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
    .where(customerSearchWhere(session, q))
    .orderBy(desc(customers.createdAt))
    .limit(pagination.pageSize)
    .offset(offset);
}

// COUNT tenant-scoped sobre el MISMO filtro que searchCustomers — nunca se
// trae todo el directorio al cliente solo para contarlo.
export async function countCustomers(
  tx: TenantTransaction,
  session: TenantSession,
  rawQ: string,
): Promise<number> {
  const q = rawQ.trim().slice(0, 100);
  const [row] = await tx
    .select({ value: count() })
    .from(customers)
    .where(customerSearchWhere(session, q));
  return row.value;
}

export type CustomerSearchResult =
  | {
      ok: true;
      rows: Awaited<ReturnType<typeof searchCustomers>>;
      total: number;
      page: number;
      pageSize: number;
    }
  | { ok: false; error: string; code: "rate_limited" };

// Wrapper que agrega el rate limit ANTES de pagar el costo de una conexión
// Postgres (checkRateLimit es una llamada de red a Upstash, más barata que
// abrir una tx). searchCustomers/countCustomers en sí quedan sin tocar —
// los tests de Fase 2 las llaman directo con un tx ya abierto.
export async function searchCustomersForSession(
  session: TenantSession,
  rawQ: string,
  pagination: PaginationParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE },
): Promise<CustomerSearchResult> {
  const rate = await checkRateLimit("customer_search_employee", session.authUserId);
  if (!rate.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      error: `Demasiadas búsquedas seguidas — espera ${rate.retryAfterSeconds}s.`,
    };
  }

  // Secuencial, NUNCA Promise.all — un tx es una sola conexión Postgres,
  // no soporta queries concurrentes (regla real de CLAUDE.md, ver
  // dashboard/logic.ts).
  const { rows, total } = await withTenantContext(session.businessId, async (tx) => {
    const rows = await searchCustomers(tx, session, rawQ, pagination);
    const total = await countCustomers(tx, session, rawQ);
    return { rows, total };
  });
  return { ok: true, rows, total, page: pagination.page, pageSize: pagination.pageSize };
}

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_OCCUPATION_LENGTH = 120;
const PHONE_RE = /^[+0-9][0-9 ()-]{4,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  // Teléfono y fecha de nacimiento son obligatorios en el alta manual
  // (decisión explícita — antes eran opcionales). Ocupación se queda
  // opcional: el cliente la da o no. dateOfBirth guarda la fecha real (no
  // edad calculada) para poder correr campañas de cumpleaños después,
  // nunca calculada acá — sin uso todavía, solo captura y almacenamiento.
  const rawPhone = String(formData.get("phone") ?? "").trim();
  if (!rawPhone || !PHONE_RE.test(rawPhone)) {
    return { error: "El teléfono es obligatorio y debe tener un formato válido." };
  }
  const phone = rawPhone;

  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (rawEmail && (rawEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(rawEmail))) {
    return { error: "El email no tiene un formato válido." };
  }
  const email = rawEmail || null;

  const rawDateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();
  if (!rawDateOfBirth) {
    return { error: "La fecha de nacimiento es obligatoria." };
  }
  const parsedDateOfBirth = new Date(`${rawDateOfBirth}T00:00:00Z`);
  if (
    !DATE_RE.test(rawDateOfBirth) ||
    Number.isNaN(parsedDateOfBirth.getTime()) ||
    parsedDateOfBirth.getTime() > Date.now()
  ) {
    return { error: "La fecha de nacimiento no es válida." };
  }
  const dateOfBirth = rawDateOfBirth;

  const rawOccupation = String(formData.get("occupation") ?? "").trim();
  if (rawOccupation.length > MAX_OCCUPATION_LENGTH) {
    return { error: "La ocupación no puede superar 120 caracteres." };
  }
  const occupation = rawOccupation || null;

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
      const [dupPhone] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.businessId, session.businessId),
            eq(customers.phone, phone),
          ),
        )
        .limit(1);
      if (dupPhone) throw new DuplicateCustomerError("teléfono");

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
          dateOfBirth,
          occupation,
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
