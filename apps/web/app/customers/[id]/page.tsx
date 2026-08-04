import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { customerBalances, customers, loyaltyPrograms, withTenantContext } from "@loyalty/db";
import { Badge } from "../../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { StampProgressBar } from "../../../components/StampProgressBar";
import { requireTenantSession } from "../../../lib/supabase/session";
import { findInTenant } from "../../../lib/tenant";
import { GoogleWalletButton } from "./wallet/GoogleWalletButton";

// Detalle de cliente. El [id] es input del cliente: findInTenant lo valida
// como UUID y lo combina SIEMPRE con el business_id de la sesión — un id de
// otro negocio termina en notFound(), indistinguible de un id inexistente
// (sin oráculo de IDOR). No se muestra wallet_token: es el secreto opaco
// del futuro pase de Wallet, la UI no lo necesita.
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  const data = await withTenantContext(session.businessId, async (tx) => {
    const row = await findInTenant(tx, session, customers, id);
    if (!row) return null;

    // El QR se genera acá, con row.walletToken todavía en scope — ANTES de
    // armar el objeto `customer` saneado de abajo. El SVG (marcado, no el
    // token) es lo único que sale de este bloque; el string crudo del token
    // nunca llega al objeto que la página renderiza.
    const qrSvg = await QRCode.toString(row.walletToken, {
      type: "svg",
      margin: 1,
      width: 220,
    });

    // Solo los campos que la vista usa — NUNCA wallet_token (hallazgo de la
    // revisión: aunque hoy no cruza al cliente, dejarlo fuera del objeto
    // hace imposible exponerlo por accidente en un refactor).
    const customer = {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      createdAt: row.createdAt,
    };

    const balances = await tx
      .select({
        currentStamps: customerBalances.currentStamps,
        cycleStartedAt: customerBalances.cycleStartedAt,
        lastStampAt: customerBalances.lastStampAt,
        programName: loyaltyPrograms.name,
        stampsRequired: loyaltyPrograms.stampsRequired,
        programActive: loyaltyPrograms.isActive,
      })
      .from(customerBalances)
      .innerJoin(
        loyaltyPrograms,
        and(
          eq(customerBalances.loyaltyProgramId, loyaltyPrograms.id),
          eq(loyaltyPrograms.businessId, session.businessId),
        ),
      )
      .where(
        and(
          eq(customerBalances.businessId, session.businessId),
          eq(customerBalances.customerId, customer.id),
        ),
      );

    return { customer, balances, qrSvg };
  });

  if (!data) {
    notFound();
  }

  const { customer, balances, qrSvg } = data;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{customer.fullName ?? "(sin nombre)"}</h1>
        <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
          ← Clientes
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Código QR</CardTitle>
          <CardDescription>
            Para pruebas del scanner: este código codifica el token opaco del
            cliente, lo mismo que llevará el pase de Wallet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* SVG generado server-side por la librería `qrcode`, no HTML de usuario */}
          <div
            className="w-fit rounded-md bg-white p-3"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd className="font-medium">{customer.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{customer.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Alta</dt>
              <dd className="font-medium">
                {customer.createdAt.toLocaleDateString("es-MX", { dateStyle: "long" })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tarjeta de sellos</CardTitle>
          <CardDescription>
            {balances.length > 0
              ? "Progreso hacia la próxima recompensa."
              : "Este cliente todavía no tiene tarjeta (no había programa activo al darlo de alta)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {balances.map((balance) => (
            <div key={balance.programName} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">{balance.programName}</p>
                <div className="flex items-center gap-2">
                  {!balance.programActive ? (
                    <Badge variant="secondary">Programa pausado</Badge>
                  ) : null}
                  <span className="text-sm text-muted-foreground">
                    {balance.currentStamps} de {balance.stampsRequired} sellos
                  </span>
                </div>
              </div>
              <StampProgressBar
                current={balance.currentStamps}
                required={balance.stampsRequired}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>
            Integración en construcción (Fase 4): pases sin credenciales
            reales todavía, ver docs/WALLET-SETUP.md. Sirve para probar el
            flujo completo antes de tener cuenta de Apple/Google.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a
            href={`/customers/${customer.id}/wallet/apple`}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
          >
            Descargar pase de Apple (prueba)
          </a>
          <GoogleWalletButton customerId={customer.id} />
        </CardContent>
      </Card>
    </main>
  );
}
