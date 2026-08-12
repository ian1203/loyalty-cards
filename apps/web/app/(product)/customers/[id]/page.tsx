import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import {
  customerBalances,
  customers,
  deviceRegistrations,
  locations,
  loyaltyPrograms,
  transactions,
  walletPasses,
  withTenantContext,
} from "@loyalty/db";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { EmptyState } from "../../../../components/EmptyState";
import { PageHeader } from "../../../../components/PageHeader";
import { StampRow } from "../../../../components/StampRow";
import { requireTenantSession } from "../../../../lib/supabase/session";
import { findInTenant } from "../../../../lib/tenant";
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

  // staff = solo /scanner — la ficha individual (PII, QR/wallet_token vía
  // los botones de Wallet, balance) no le corresponde. Ver el gate gemelo
  // en customers/page.tsx.
  if (session.role === "staff") {
    redirect("/scanner");
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
      dateOfBirth: row.dateOfBirth,
      occupation: row.occupation,
      createdAt: row.createdAt,
    };

    // wallet_passes.platform NO significa "el cliente usa esta plataforma"
    // — se prepara para AMBAS automáticamente en todo auto-registro
    // (buildWalletArtifactsForNewEnrollment llama ensureWalletPass para
    // apple Y google sin importar el dispositivo real) y cada botón de
    // descarga del alta manual crea la suya propia. La única señal de
    // instalación CONFIRMADA es Apple: device_registrations solo tiene
    // fila cuando el dispositivo real llamó al web service de PassKit
    // después de tocar "Agregar" — Google no tiene ningún callback
    // equivalente en este código, así que para Google solo podemos decir
    // "se generó un link", nunca "se confirmó".
    const walletRows = await tx
      .select({ platform: walletPasses.platform, walletPassId: walletPasses.id })
      .from(walletPasses)
      .where(
        and(
          eq(walletPasses.businessId, session.businessId),
          eq(walletPasses.customerId, customer.id),
        ),
      );
    const applePassIds = walletRows.filter((w) => w.platform === "apple").map((w) => w.walletPassId);
    const hasConfirmedApple =
      applePassIds.length > 0
        ? (
            await tx
              .select({ id: deviceRegistrations.id })
              .from(deviceRegistrations)
              .where(
                and(
                  eq(deviceRegistrations.businessId, session.businessId),
                  inArray(deviceRegistrations.walletPassId, applePassIds),
                ),
              )
              .limit(1)
          ).length > 0
        : false;
    const hasGeneratedGoogle = walletRows.some((w) => w.platform === "google");

    // "Sucursal de alta" no se captura en ningún lado hoy (ni el alta
    // manual ni /enroll piden sucursal) — en vez de agregar un campo nuevo
    // o inferir por IP (impreciso y una señal de ubicación que no
    // necesitamos pedir), se usa la sucursal de su PRIMER sello real
    // (transactions ya la registra por cada visita) como proxy honesto:
    // ningún dato nuevo, ninguna captura nueva, ninguna inferencia turbia.
    const [firstStampLocation] = await tx
      .select({ locationName: locations.name })
      .from(transactions)
      .innerJoin(
        locations,
        and(eq(locations.id, transactions.locationId), eq(locations.businessId, session.businessId)),
      )
      .where(
        and(
          eq(transactions.businessId, session.businessId),
          eq(transactions.customerId, customer.id),
        ),
      )
      .orderBy(asc(transactions.createdAt))
      .limit(1);

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

    return { customer, balances, qrSvg, hasConfirmedApple, hasGeneratedGoogle, firstStampLocation };
  });

  if (!data) {
    notFound();
  }

  const { customer, balances, qrSvg, hasConfirmedApple, hasGeneratedGoogle, firstStampLocation } = data;
  // Cada wallet lleva su propio calificador explícito — un solo
  // "(sin confirmar)" al final de la lista se leía como si aplicara a
  // ambos (hallazgo real: así lo interpretó el dueño del negocio) en vez
  // de solo a Google.
  const walletLabels = [
    hasConfirmedApple ? "Apple Wallet (confirmado)" : null,
    hasGeneratedGoogle ? "Google Wallet (sin confirmar)" : null,
  ].filter((label): label is string => label !== null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={customer.fullName ?? "(sin nombre)"}
        back={{ href: "/customers", label: "Clientes" }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Código QR</CardTitle>
          <CardDescription>
            Para pruebas del scanner: este código codifica el token opaco del
            cliente, lo mismo que llevará el pase de Wallet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* SVG generado server-side por la librería `qrcode`, no HTML de usuario.
              bg-white es intencional y fijo en ambos temas (no un token de fondo
              del tema): un QR necesita su "zona de silencio" siempre clara para
              que cualquier lector lo reconozca — no es un descuido de dark mode. */}
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
              <dt className="text-muted-foreground">Cumpleaños</dt>
              <dd className="font-medium">
                {customer.dateOfBirth
                  ? new Date(`${customer.dateOfBirth}T00:00:00Z`).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  : "—"}
              </dd>
            </div>
            {customer.occupation ? (
              <div>
                <dt className="text-muted-foreground">Ocupación</dt>
                <dd className="font-medium">{customer.occupation}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">Wallet</dt>
              <dd className="font-medium">
                {walletLabels.length > 0 ? walletLabels.join(" · ") : "Sin pase todavía"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Alta</dt>
              <dd className="font-medium">
                {customer.createdAt.toLocaleDateString("es-MX", { dateStyle: "long" })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sucursal (primer sello)</dt>
              <dd className="font-medium">{firstStampLocation?.locationName ?? "Sin sellos todavía"}</dd>
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
        <CardContent className="flex flex-col gap-5">
          {balances.length === 0 ? (
            <EmptyState
              title="Este cliente todavía no tiene tarjeta"
              description="No había un programa activo al darlo de alta — se crea sola en cuanto reciba su primer sello."
            />
          ) : (
            balances.map((balance) => (
              <div key={balance.programName} className="flex flex-col gap-2.5">
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
                <StampRow current={balance.currentStamps} required={balance.stampsRequired} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>
            Entrega manual del pase — útil para clientes dados de alta desde el
            dashboard, que no pasaron por el auto-registro (/enroll).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href={`/customers/${customer.id}/wallet/apple`}>Descargar pase de Apple</a>
          </Button>
          <GoogleWalletButton customerId={customer.id} />
        </CardContent>
      </Card>
    </div>
  );
}
