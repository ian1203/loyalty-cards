import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Placeholder de resolución de tenant por request: sin autenticación real
// todavía (fuera de scope de Fase 0), el business_id llega en un header —
// TODO reemplazar por sesión/JWT en la fase de auth. Se reenvía a los route
// handlers (que sí corren en runtime Node.js) vía un header interno; ahí es
// donde se debe llamar a withTenantContext() de @loyalty/db antes de tocar
// la base de datos. Un route handler que no reciba x-tenant-business-id debe
// tratarlo como no autenticado (401/403) — nunca asumir un tenant por
// defecto ni proceder sin él.
//
// Este middleware corre en el runtime Edge de Next.js, que no soporta el
// driver `pg` (TCP nativo de Node) — por eso no importa @loyalty/db
// directamente ni llama a withTenantContext() aquí.
//
// Fail-closed fuera de dev: confiar en un header que pone el propio cliente
// para decidir de qué negocio son los datos es exactamente el escenario que
// no puede llegar a producción sin autenticación real detrás. Mientras ese
// TODO siga sin resolverse, el header se ignora fuera de desarrollo — mejor
// que cualquier ruta de datos futura falle cerrada (sin tenant resuelto) a
// que confíe en un input del cliente sin verificar.
export function middleware(request: NextRequest) {
  const trustClientTenantHeader = process.env.NODE_ENV !== "production";
  const requestHeaders = new Headers(request.headers);

  if (trustClientTenantHeader) {
    const businessId = request.headers.get("x-business-id");
    if (businessId) {
      requestHeaders.set("x-tenant-business-id", businessId);
    }
  } else {
    requestHeaders.delete("x-tenant-business-id");
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
