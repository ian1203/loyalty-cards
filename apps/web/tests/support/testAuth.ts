import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { platformAdmins, roles, users } from "@loyalty/db";
import { adminDb, createBusinessWithOwner } from "@loyalty/db/admin";

// Compartido por apps/web/tests/*.test.ts que necesitan sesiones reales,
// firmadas por el Supabase Auth local, sin levantar next dev/start. Ver el
// comentario en apps/web/lib/supabase/server.ts sobre por qué hace falta un
// jar de cookies en memoria en vez de next/headers cookies().

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function anonClient() {
  return createSupabaseJsClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function supabaseAdminClient() {
  return createSupabaseJsClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function createMemoryCookieJar(
  seed: Array<{ name: string; value: string }> = [],
): CookieMethodsServer {
  const store = new Map(seed.map(({ name, value }) => [name, value]));
  return {
    getAll() {
      return Array.from(store.entries()).map(([name, value]) => ({ name, value }));
    },
    setAll(cookiesToSet) {
      for (const { name, value } of cookiesToSet) {
        store.set(name, value);
      }
    },
  };
}

// Login real (password real, contra el servidor de Auth local) + el mismo
// mecanismo de serialización de cookies que usa @supabase/ssr en un
// navegador real (setSession sobre un cliente respaldado por el jar).
export async function signInAsCookieJar(
  email: string,
  password: string,
): Promise<CookieMethodsServer> {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(
      `No se pudo iniciar sesión como ${email}: ${error?.message ?? "sin sesión"}`,
    );
  }

  const jar = createMemoryCookieJar();
  const serverClient = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies: jar },
  );
  await serverClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  return jar;
}

export async function createPlatformAdmin(
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabaseAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el admin de plataforma: ${error?.message}`);
  }
  await adminDb.insert(platformAdmins).values({ authUserId: data.user.id });
  return data.user.id;
}

export async function createOwnerAuthUser(
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabaseAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el dueño: ${error?.message}`);
  }
  return data.user.id;
}

export async function createBusinessWithRealOwner(input: {
  businessName: string;
  slug: string;
  ownerEmail: string;
  ownerPassword: string;
  createdByAuthUserId: string;
}) {
  const ownerAuthUserId = await createOwnerAuthUser(input.ownerEmail, input.ownerPassword);
  const business = await createBusinessWithOwner({
    businessName: input.businessName,
    slug: input.slug,
    ownerEmail: input.ownerEmail,
    ownerAuthUserId,
    createdByAuthUserId: input.createdByAuthUserId,
  });
  return { business, ownerAuthUserId };
}

// Staff real en un negocio existente: auth.users real (login posible) +
// fila en public.users con el rol global 'staff'. adminDb SOLO como setup de
// test (regla de CLAUDE.md).
export async function createRealStaffUser(input: {
  businessId: string;
  email: string;
  password: string;
}): Promise<string> {
  const staffAuthUserId = await createOwnerAuthUser(input.email, input.password);
  const [staffRole] = await adminDb.select().from(roles).where(eq(roles.name, "staff"));
  if (!staffRole) {
    throw new Error("No existe el rol global 'staff' — revisa el seed de roles.");
  }
  await adminDb.insert(users).values({
    businessId: input.businessId,
    authUserId: staffAuthUserId,
    email: input.email,
    roleId: staffRole.id,
  });
  return staffAuthUserId;
}
