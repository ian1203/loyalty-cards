---
name: wallet-integration
description: Modelo de datos, patrón de adaptadores y reglas de seguridad para la integración con Apple Wallet y Google Wallet (Fase 4+). Úsala SIEMPRE antes de escribir o modificar código de generación/firma de pases, el web service de PassKit, el cliente APNs, o el adaptador de Google Wallet — define cómo el pase se relaciona con el modelo multi-tenant y cómo separar credenciales reales de fakes.
---

# Integración Wallet — Apple + Google

## Modelo multi-tenant del pase

Tres niveles, no confundirlos:

1. **Issuer de plataforma** (uno solo, global): la cuenta Apple Developer
   (Pass Type ID + certificado de firma) y la cuenta de servicio de Google
   Wallet (issuer account) pertenecen a LA PLATAFORMA, no a cada negocio.
   Todos los pases de todos los negocios se firman/emiten con las mismas
   credenciales de plataforma — igual que un solo `adminDb`/service role
   sirve a todos los tenants sin ser "de" ninguno.
2. **Clase/plantilla por negocio**: cada negocio tiene su propia
   definición visual y de campos — en Apple es la plantilla de `pass.json`
   (colores, logo, nombre del programa) que se usa para generar los pases
   de SUS clientes; en Google es un **Loyalty Class** por negocio (creado/
   actualizado vía la API cuando el dueño configura `/rewards`). La clase
   NO lleva datos de ningún cliente — es la plantilla.
3. **Cliente = pase individual**: cada `customers` row tiene, como mucho,
   un `wallet_passes` row por plataforma (apple/google). En Apple es un
   `pass.json` completo firmado (serial number = el id del pase); en
   Google es un **Loyalty Object** que referencia la Class del negocio.

El código de barras/QR del pase usa el **mismo `wallet_token` opaco** que
ya resuelve `lookupCustomerByTokenForSession` en el scanner (Fase 3) — no
se genera un token nuevo para Wallet. Un solo secreto por cliente, un solo
lookup tenant-scoped que ya está probado.

## Patrón de adaptador: real vs. fake

Toda dependencia de un proveedor externo (firma de `.pkpass`, envío APNs,
firma del JWT de Google) vive detrás de una **interfaz** con dos
implementaciones:

```ts
export interface PkpassSigner {
  sign(bundle: PkpassBundle): Promise<Buffer>; // .pkpass firmado
}
```

- **Real**: usa la credencial real (certificado Apple, llave `.p8`, JSON
  de cuenta de servicio de Google). Se activa SOLO si la variable de
  entorno correspondiente está presente y bien formada.
- **Fake**: autofirmada (Apple: certificado autofirmado generado con
  `openssl`, no confiable para dispositivos reales pero ejercita byte a
  byte el pipeline firma→manifest→zip) o mock (APNs: no golpea la red,
  registra el payload que habría mandado; Google: firma con una clave de
  prueba fija, no llama a la API real). Es la implementación por defecto
  en dev/test/CI.

**Quién decide cuál se usa**: un único punto de arranque (guard de
secretos, paso b de la Fase 4) inspecciona el entorno UNA vez y devuelve
la impl correspondiente. El resto del código nunca pregunta "¿hay
credenciales?" — solo usa la interfaz. Agregar la credencial real después
NO cambia ninguna línea de lógica de negocio, solo hace que el guard elija
la otra rama.

**Secretos, sin excepción**: solo por variable de entorno, nunca en el
repo (regla ya vigente en CLAUDE.md, esto es su aplicación a Wallet). El
guard de arranque, si falta un secreto para activar la impl real, no
revienta el arranque de la app — cae a la fake y lo dice claro en el log.
Fallar así es el estado ESPERADO en dev/CI sin credenciales, no un error.

## Apple: web service de PassKit

Es un **endpoint público** (Apple lo llama directo desde cualquier
iPhone con el pase instalado, sin sesión de nuestra app) que Apple define
con esta forma exacta:

- `POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}` — registra el dispositivo para recibir push de ese pase.
- `DELETE` a la misma URL — desregistra.
- `GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince=<tag>` — lista los serial numbers de pases de ese dispositivo que cambiaron.
- `GET /v1/passes/{passTypeIdentifier}/{serialNumber}` — devuelve el `.pkpass` más reciente.
- `POST /v1/log` — logs de error del dispositivo (best-effort, solo loguear).

**Autenticación**: header `Authorization: ApplePass <authenticationToken>`
— el token va EMBEBIDO en el `pass.json` de cada pase individual, así que
es **por pase, no por negocio ni por plataforma**. Cada endpoint valida
ese token contra el pase (`serialNumber`) que la URL pide, dentro del
tenant al que ese pase pertenece — un token válido de un pase del negocio
B nunca debe devolver ni mutar nada del negocio A, aunque el
`passTypeIdentifier` (de plataforma) sea el mismo para ambos. Este es el
mismo patrón anti-IDOR de siempre (`findInTenant`), aplicado a un endpoint
que —a diferencia de todo lo construido hasta Fase 3— NO tiene sesión de
Supabase: la identidad acá es 100% el `authenticationToken` del pase.

**Nada de datos de tenant en caché**: las respuestas de este web service
(el `.pkpass`, las listas de seriales) llevan `Cache-Control: no-store`.
Ni CDN, ni cache HTTP intermedio, ni el navegador deben guardar una
respuesta que identifique al cliente/negocio — mismo principio que ya
rige para el service worker (CLAUDE.md, regla no negociable de Fase 3).

## Ciclo de actualización tras una transacción

- **Apple no recibe datos por push** — el push es un mensaje VACÍO vía
  APNs que solo le dice al dispositivo "tu pase cambió, pídelo de nuevo".
  El dispositivo entonces hace `GET /v1/passes/...` (arriba) y ahí sí se
  sirve el `.pkpass` actualizado. Flujo: sello/canje → encolar push vacío
  a los `device_registrations` de ese pase → dispositivo hace pull.
- **Google no usa push**: el objeto se actualiza con un `PATCH` directo a
  la Google Wallet REST API (firmado con la cuenta de servicio). Google
  Wallet sincroniza el pase instalado automáticamente al recibir el PATCH
  — no hay servidor propio que atender ni dispositivos que registrar.

**Best-effort, nunca revierte**: si el push a Apple falla (dispositivo
offline, error de red, token de push vencido), la transacción de negocio
(sello/canje) YA se confirmó en la DB — eso manda. El push se reintenta
con backoff, pero un fallo de Wallet jamás deshace un sello real.

## Qué NO hacer

- Generar un `wallet_token` nuevo para Wallet — reusar el que ya existe en
  `customers.wallet_token`.
- Guardar el `authenticationToken` de un pase donde otro tenant pueda
  leerlo (va en `wallet_passes`, tabla con RLS + filtro explícito, igual
  que todo lo demás).
- Cachear cualquier respuesta del web service de Apple o del endpoint de
  entrega del `.pkpass`.
- Poner una credencial real (certificado, `.p8`, JSON de cuenta de
  servicio) en el repo, en un commit, o en un log — solo variable de
  entorno.
- Bloquear una transacción de sello/canje esperando a que el push de
  Wallet termine — el push es asíncrono y best-effort.
