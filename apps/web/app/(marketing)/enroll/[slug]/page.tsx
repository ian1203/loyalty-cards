import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveBusinessBySlug } from "@loyalty/db/enroll";
import { EnrollForm } from "./EnrollForm";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const business = await getActiveBusinessBySlug(slug);
  return { title: business ? `Regístrate en ${business.name}` : "Registro" };
}

// Ruta pública sin sesión (mismo espíritu que el resto de (marketing)):
// nunca llama cookies()/headers()/getVerifiedSession(). A diferencia de "/"
// y "/privacidad" SÍ es dinámica (lee el negocio por slug en cada
// request) — no forma parte del conjunto que next build debe mantener
// ○ Static, ver CLAUDE.md. notFound() para slug inexistente o negocio
// suspendido: mismo mensaje que "no existe", nunca un error que confirme
// cuál es el caso (igual criterio anti-oráculo que findInTenant).
export default async function EnrollPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const business = await getActiveBusinessBySlug(slug);
  if (!business) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col items-center gap-2 text-center">
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo de negocio por URL dinámica, fuera de la lista de dominios de next/image
          <img
            src={business.logoUrl}
            alt={`Logo de ${business.name}`}
            className="mb-2 h-16 w-16 rounded-full object-cover shadow-token-sm"
          />
        ) : null}
        <p className="text-sm font-medium uppercase tracking-wide text-primary">{business.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">Únete al programa de lealtad</h1>
        <p className="text-sm text-muted-foreground">
          Regístrate y agrega tu tarjeta de sellos a tu celular en un minuto.
        </p>
      </header>
      <EnrollForm businessSlug={slug} />
    </div>
  );
}
