import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Invariantes de "listo para producción" que no son comportamiento de
// feature — son propiedades ESTÁTICAS del código que deben sostenerse para
// siempre, no solo hoy. Mismo patrón walkTsFiles que ya usa
// fase2-features.test.ts para el guard de adminDb/VerifiedBusinessId — se
// reimplementa acá (no se extrae a un helper compartido: son ~15 líneas,
// no amerita la indirección).
function walkTsFiles(rootDir: string, onFile: (relPath: string, content: string) => void) {
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (fullPath.endsWith(".test.ts")) continue;
      onFile(relative(rootDir, fullPath), readFileSync(fullPath, "utf8"));
    }
  }
  walk(rootDir);
}

describe("scoping de secretos — service role nunca al cliente", () => {
  // Único uso real hoy: createAdminClient() en lib/supabase/server.ts,
  // confinado (junto con adminDb) al camino de /admin. Filtrar el service
  // role al navegador bypasea RLS/Auth por completo — es el peor bug
  // posible de esta plataforma, así que esto queda como invariante
  // permanente, no una revisión puntual antes del primer deploy.
  const ALLOWED_SERVICE_ROLE_KEY_FILES = new Set(["lib/supabase/server.ts"]);

  it("SUPABASE_SERVICE_ROLE_KEY solo se referencia en el archivo server-only permitido", () => {
    const webDir = join(__dirname, "..");
    const offenders: string[] = [];

    for (const subdir of ["app", "lib"]) {
      walkTsFiles(join(webDir, subdir), (relPath, content) => {
        if (!content.includes("SUPABASE_SERVICE_ROLE_KEY")) return;
        const rel = `${subdir}/${relPath}`;
        if (ALLOWED_SERVICE_ROLE_KEY_FILES.has(rel)) return;
        offenders.push(rel);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('ningún archivo "use client" importa createAdminClient ni referencia SUPABASE_SERVICE_ROLE_KEY', () => {
    const webDir = join(__dirname, "..");
    const offenders: string[] = [];

    for (const subdir of ["app", "lib", "components"]) {
      walkTsFiles(join(webDir, subdir), (relPath, content) => {
        const isClientFile = content.trimStart().startsWith('"use client"');
        if (!isClientFile) return;
        if (!content.includes("createAdminClient") && !content.includes("SUPABASE_SERVICE_ROLE_KEY")) return;
        offenders.push(`${subdir}/${relPath}`);
      });
    }

    expect(offenders).toEqual([]);
  });

  // Excepción angosta al "cero adminDb fuera de /admin": createAdminClient()
  // (Supabase Auth Admin API, no adminDb/Postgres, pero mismo espíritu de
  // la regla) solo puede importarse desde el camino confinado de /admin y
  // desde lib/employeeOffboarding.ts (bloqueo de login de un empleado
  // desactivado, ver esa función) y app/(product)/team/logic.ts (alta de
  // staff real, misma necesidad de crear un auth.users real). Cualquier
  // uso futuro fuera de esta lista debe fallar este test, no quedar en un
  // comentario.
  const ALLOWED_CREATE_ADMIN_CLIENT_IMPORTERS = new Set([
    "app/admin/actions.ts",
    "app/admin/accounts.ts",
    "app/admin/activity.ts",
    "lib/employeeOffboarding.ts",
    "app/(product)/team/logic.ts",
  ]);

  it("createAdminClient() solo se importa desde los archivos confinados permitidos", () => {
    const webDir = join(__dirname, "..");
    const offenders: string[] = [];

    for (const subdir of ["app", "lib", "components"]) {
      walkTsFiles(join(webDir, subdir), (relPath, content) => {
        if (!content.includes("createAdminClient")) return;
        const rel = `${subdir}/${relPath}`;
        if (rel === "lib/supabase/server.ts") return; // define la función, no la importa
        if (ALLOWED_CREATE_ADMIN_CLIENT_IMPORTERS.has(rel)) return;
        offenders.push(rel);
      });
    }

    expect(offenders).toEqual([]);
  });

  it("ninguna variable NEXT_PUBLIC_ declarada en .env.example expone el service role", () => {
    const envExamplePath = join(__dirname, "..", "..", "..", ".env.example");
    const content = readFileSync(envExamplePath, "utf8");
    const publicVarNames = [...content.matchAll(/^(NEXT_PUBLIC_[A-Z0-9_]+)=/gm)].map((m) => m[1]);

    const offenders = publicVarNames.filter((name) => name.includes("SERVICE_ROLE"));

    expect(offenders).toEqual([]);
  });
});

describe("runtime — Node para todo lo que toca pg, Edge solo para middleware", () => {
  // Edge no soporta el driver `pg` (TCP nativo de Node) — ver el
  // comentario de middleware.ts. Ningún route handler de esta app debería
  // declarar runtime "edge" nunca: es guardia a futuro, no solo snapshot
  // de hoy (un contributor que agregue `export const runtime = "edge"` a
  // una ruta nueva que toque @loyalty/db rompería el deploy en Vercel).
  it("ningún route.ts bajo app/ declara runtime edge", () => {
    const webDir = join(__dirname, "..");
    const offenders: string[] = [];

    walkTsFiles(join(webDir, "app"), (relPath, content) => {
      if (!relPath.endsWith("route.ts")) return;
      if (/runtime\s*=\s*["']edge["']/.test(content)) {
        offenders.push(`app/${relPath}`);
      }
    });

    expect(offenders).toEqual([]);
  });

  it("todo route.ts bajo app/ declara runtime nodejs explícitamente", () => {
    const webDir = join(__dirname, "..");
    const offenders: string[] = [];

    walkTsFiles(join(webDir, "app"), (relPath, content) => {
      if (!relPath.endsWith("route.ts")) return;
      if (!/runtime\s*=\s*["']nodejs["']/.test(content)) {
        offenders.push(`app/${relPath}`);
      }
    });

    expect(offenders).toEqual([]);
  });
});
