# Wallet — qué falta para pasar de fake a real

Fase 4 dejó **todo el código completo**: firma de `.pkpass` (PKCS#7 real vía
`node-forge`), cliente APNs (JWT `.p8` real), cliente de Google Wallet (JWT
de cuenta de servicio real), web service público de Apple, entrega
autenticada del pase, y el hook que actualiza ambas plataformas tras cada
sello/canje. Todo corre hoy con implementaciones **fake** (autofirmadas o
mockeadas — ver `.claude/skills/wallet-integration/SKILL.md`) porque no hay
credenciales reales en el entorno.

**Meter las credenciales de abajo NO cambia ninguna línea de código.** El
guard en `packages/wallet/src/config.ts` (`resolveWalletConfig`) revisa el
entorno una sola vez, por proveedor, todo-o-nada: si están las 7 variables
de Apple, activa Apple real; si faltan una o más, sigue en fake. Mismo
criterio para Google con sus 2 variables. No hay flag que prender a mano —
alcanza con setear las variables de entorno.

Esta guía lista, EN ORDEN, qué conseguir por fuera del código y en qué
variable de entorno va cada cosa. Nada de esto se puede automatizar desde
acá — son trámites y descargas que solo el dueño de la cuenta puede hacer.

---

## 1. APPLE — de pago (~$99 USD/año)

### 1.1 Apple Developer Program

Inscripción en https://developer.apple.com/programs/ — **de pago**, ~$99
USD/año. Dos variantes:

- **Individual**: solo necesita el Apple ID de la persona. Aprobación
  normalmente en minutos/horas.
- **Organización**: necesita un D-U-N-S Number (gratis, pero el trámite de
  obtenerlo si la empresa no lo tiene ya puede tardar días/semanas) y que
  quien inscribe tenga autoridad legal para actuar en nombre de la empresa.
  Apple valida esto contra registros públicos — **puede tardar varios días
  hábiles**, a veces más si el D-U-N-S es nuevo. Planeá este paso con
  margen si es la primera vez que la empresa se inscribe.

### 1.2 Pass Type ID

En https://developer.apple.com/account/resources/identifiers/list/passTypeId
→ crear un nuevo **Pass Type ID** (formato `pass.com.tuempresa.loyalty` o
similar — es un identificador de plataforma, uno solo para toda la app, no
uno por negocio tenant).

→ `WALLET_APPLE_PASS_TYPE_IDENTIFIER`

También en esa misma pantalla de la cuenta developer, anotar el **Team ID**
(10 caracteres, visible en la esquina superior derecha del portal, o en
Membership Details).

→ `WALLET_APPLE_TEAM_ID`

### 1.3 Certificado de firma del pase

Desde el Pass Type ID creado arriba → "Create Certificate" → sigue el flujo
estándar de Apple (generar un CSR con Keychain Access o `openssl`, subirlo,
descargar el `.cer` resultante). Convertir a PEM:

```bash
# Del .cer descargado a PEM (certificado):
openssl x509 -inform DER -in pass.cer -out pass_cert.pem

# Exportar la llave privada del Keychain/CSR como .p12, y de ahí a PEM:
openssl pkcs12 -in pass.p12 -nocerts -out pass_key.pem -nodes
```

→ el CONTENIDO del `pass_cert.pem` completo (con las líneas
`-----BEGIN CERTIFICATE-----`) va en `WALLET_APPLE_PASS_CERT_PEM`
→ el CONTENIDO del `pass_key.pem` completo va en `WALLET_APPLE_PASS_KEY_PEM`

### 1.4 Certificado WWDR (Apple Worldwide Developer Relations)

Se descarga de https://www.apple.com/certificateauthority/ (buscar
"Worldwide Developer Relations - G4" o la variante vigente al momento —
Apple rota esto ocasionalmente). Convertir a PEM igual que el de arriba:

```bash
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr_cert.pem
```

→ `WALLET_APPLE_WWDR_CERT_PEM`

### 1.5 Llave APNs (.p8) para las actualizaciones push

En https://developer.apple.com/account/resources/authkeys/list → "Create a
Key" → habilitar "Apple Push Notifications service (APNs)" → descargar el
archivo `.p8` (**Apple solo lo deja descargar UNA vez** — guardarlo bien).
Anotar el **Key ID** que Apple muestra al crearla.

→ el CONTENIDO completo del archivo `.p8` va en `WALLET_APPLE_APNS_PRIVATE_KEY_PEM`
→ el Key ID va en `WALLET_APPLE_APNS_KEY_ID`
→ (`WALLET_APPLE_TEAM_ID`, ya lo tenés del paso 1.2, se reusa acá)

### Qué desbloquea Apple

Con las 7 variables completas: instalación real de un `.pkpass` firmado en
un iPhone, y actualizaciones automáticas tras cada sello/canje (push vacío
→ el dispositivo pide el pase actualizado). Sin esto, el `.pkpass` que se
genera hoy es válido estructuralmente pero firmado con una impl fake — un
iPhone real lo va a rechazar por certificado no confiable.

---

## 2. GOOGLE CLOUD — gratis (no es lo mismo que "publicar")

Importante: esta sección es gratis y NO requiere aprobación de Google — lo
que se consigue acá alcanza para pases reales en **modo demo** (marcados
`[TEST ONLY]` para quien los reciba). Publicar sin esa marca es la sección
3, aparte.

### 2.1 Proyecto de Google Cloud + cuenta de servicio

1. Crear (o reusar) un proyecto en https://console.cloud.google.com/
2. En ese proyecto → "IAM & Admin" → "Service Accounts" → crear una cuenta
   de servicio nueva (cualquier nombre, ej. `wallet-issuer`).
3. Sobre esa cuenta de servicio → "Keys" → "Add Key" → "Create new key" →
   tipo **JSON** → se descarga un archivo `.json`.

→ el CONTENIDO completo de ese archivo JSON (tal cual, sin editar) va en
`WALLET_GOOGLE_SERVICE_ACCOUNT_JSON`. El código valida que traiga
`client_email` y `private_key` — si el JSON está incompleto o mal formado,
cae a fake con un WARN explicando qué falta (ver `config.ts`), nunca
revienta el arranque.

### 2.2 Habilitar la API y registrar el issuer

1. En el mismo proyecto → "APIs & Services" → "Library" → buscar "Google
   Wallet API" → Enable.
2. Ir a https://pay.google.com/business/console/ → crear (o reusar) una
   cuenta de **Google Wallet API Issuer** — Google te da un **Issuer ID**
   numérico.

→ `WALLET_GOOGLE_ISSUER_ID`

3. En esa misma consola, agregar el `client_email` de la cuenta de
   servicio del paso 2.1 como usuario autorizado de la cuenta issuer (si
   no se hace esto, las llamadas a la API responden 403 aunque el JWT esté
   bien firmado).

### Qué desbloquea Google Cloud

Con las 2 variables completas: pases reales de Google Wallet, instalables
en Android, con actualización automática vía PATCH tras cada sello/canje —
pero marcados **"[TEST ONLY]"** visible para quien los instale, porque la
cuenta issuer todavía no tiene aprobación de publicación (sección 3).

### ⚠️ Un mismo Issuer ID entre ambientes (staging/prod) pisa datos

Los IDs de Loyalty Class/Object se derivan determinísticamente
(`{issuerId}.biz_{businessId}` / `{issuerId}.pass_{customerId}`, ver
`packages/wallet/src/google/loyaltyPayload.ts`) — NO se guardan en el
esquema. Si un ambiente de staging usa el MISMO `WALLET_GOOGLE_ISSUER_ID`
que producción y comparte los mismos UUIDs de negocio/cliente (típico si
staging se levanta clonando la DB de prod), un sello de prueba en staging
sobreescribe el Loyalty Object REAL de un cliente de producción. Usar un
Issuer ID (o cuanto menos una cuenta de servicio) **distinto por
ambiente** — nunca el mismo proyecto de Google Cloud para staging y prod.

---

## 3. GOOGLE PUBLISHING — gratis, pero con aprobación

Trámite separado, gratis, dentro de la misma consola de
https://pay.google.com/business/console/ → sección de tu cuenta issuer →
"Request publishing access" (el nombre exacto de la opción puede variar
según la versión de la consola). Google revisa la clase/marca antes de
aprobar — no hay una variable de entorno nueva para esto, es un estado que
cambia del lado de Google una vez aprobado.

### Qué desbloquea

Los pases dejan de mostrar "[TEST ONLY]" — production real, visible tal
cual para cualquier usuario final. Sin esto, el código y las credenciales
ya funcionan igual (sección 2), solo cambia esa marca visual.

---

## Resumen de variables de entorno

| Variable | De dónde sale |
|---|---|
| `WALLET_APPLE_TEAM_ID` | Portal developer, Membership Details (§1.2) |
| `WALLET_APPLE_PASS_TYPE_IDENTIFIER` | Identifiers → Pass Type IDs (§1.2) |
| `WALLET_APPLE_PASS_CERT_PEM` | Certificado del Pass Type ID, convertido a PEM (§1.3) |
| `WALLET_APPLE_PASS_KEY_PEM` | Llave privada del mismo certificado, PEM (§1.3) |
| `WALLET_APPLE_WWDR_CERT_PEM` | Certificado WWDR de Apple, PEM (§1.4) |
| `WALLET_APPLE_APNS_KEY_ID` | Al crear la llave APNs (§1.5) |
| `WALLET_APPLE_APNS_PRIVATE_KEY_PEM` | Contenido del archivo `.p8` (§1.5) |
| `WALLET_GOOGLE_ISSUER_ID` | Google Wallet API Business Console (§2.2) |
| `WALLET_GOOGLE_SERVICE_ACCOUNT_JSON` | JSON de la cuenta de servicio (§2.1) |

**Nunca committear estos valores.** Van solo en las variables de entorno
del entorno de despliegue (o en `.env.local` para pruebas locales — ya
está en `.gitignore` del resto del proyecto). Ver la regla no negociable
correspondiente en `CLAUDE.md`.

---

## Verificación pendiente (una vez que existan las credenciales)

Las credenciales reales de Apple y Google ya están cargadas en producción
— items 1, 2 y 5 de abajo **ya se confirmaron con dispositivo/evidencia
real** (Carlo, Apple; push automático confirmado sin reinstalar, ~6 min
de latencia — protocolo `GET /registrations` → `GET /passes/{serial}`
real, no una reinstalación; Google confirmado con GET real contra la API
tras un sello real). Genuinamente pendientes: 3, 4 y 6.

1. ~~Agregar el pase en un iPhone real~~ — **confirmado**.
2. ~~Sellar y ver la actualización en vivo (Apple)~~ — **confirmado**.
3. **Desregistro**: borrar el pase desde Wallet en el iPhone → confirmar
   en la DB (`device_registrations`) que la fila correspondiente
   desaparece (Apple llama al DELETE del web service al borrarlo).
4. **Agregar el pase en Android real**: desde `/customers/{id}`,
   tocar "Agregar a Google Wallet" → confirmar que se instala en un
   dispositivo Android real (todo lo de Google en este proyecto se
   verificó por API directa hasta ahora, nunca en un teléfono Android
   real) y que el balance/QR coinciden con los del negocio.
5. ~~Actualización del pase de Google~~ — **confirmado**.
6. **Cross-check de aislamiento**: repetir 1-2 con un cliente de OTRO
   negocio tenant, confirmar que cada pase lleva el branding/nombre de SU
   propio negocio — no hay mezcla entre tenants (esto ya está cubierto por
   tests automatizados con las impls fake; este paso es la confirmación
   visual con credenciales reales).
