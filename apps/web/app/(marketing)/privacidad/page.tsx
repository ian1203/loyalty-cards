import type { Metadata } from "next";
import { BRAND, CONTACT } from "../../../lib/marketing/content";

// BORRADOR — pendiente de revisión legal antes de publicar. Estructurado
// para alinear con la LFPDPPP (Ley Federal de Protección de Datos
// Personales en Posesión de los Particulares): distingue el rol de
// IGA Analytics como RESPONSABLE de los datos de sus propios usuarios
// (dueños/staff de negocio, leads de la demo) frente a su rol de
// ENCARGADO de los datos de los clientes finales de cada negocio (el
// negocio tenant es el responsable de esos datos, no la plataforma) — ver
// CLAUDE.md, modelo multi-tenant. No se marca "borrador" en la página
// pública a propósito (el usuario revisa y aprueba el texto antes de que
// esto salga a producción; esta nota es solo para quien lea el código).
export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description: `Aviso de privacidad de ${BRAND.name}.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Aviso de privacidad</h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: [fecha pendiente de fijar al publicar]. Este aviso aplica al sitio y a la
          plataforma de {BRAND.name}.
        </p>
      </header>

      <Section title="1. Responsable del tratamiento">
        <p>
          [Razón social pendiente de completar], con domicilio en {CONTACT.location} (&quot;
          {BRAND.name}&quot;, &quot;nosotros&quot;), es responsable del tratamiento de los datos personales que recaba
          directamente de: (a) representantes y personal de los negocios que contratan el servicio, y
          (b) personas que solicitan información o una demostración a través de este sitio.
        </p>
      </Section>

      <Section title="2. Un rol distinto para los clientes finales de cada negocio">
        <p>
          Cuando un negocio da de alta a uno de sus clientes en su programa de lealtad (por ejemplo, para
          emitir una tarjeta en Apple Wallet o Google Wallet), <strong>el negocio es el responsable</strong> de
          esos datos personales frente a su propio cliente — decide qué recaba y para qué. {BRAND.name}{" "}
          actúa como <strong>encargado</strong>: trata esos datos únicamente para prestar el servicio
          contratado por el negocio (emitir y actualizar la tarjeta digital, registrar visitas y
          recompensas), nunca para fines propios ni para transferirlos a terceros ajenos al negocio. Cada
          negocio, a su vez, debe contar con su propio aviso de privacidad frente a sus clientes.
        </p>
      </Section>

      <Section title="3. Datos personales que recabamos">
        <ul className="list-disc pl-5">
          <li>Datos de identificación y contacto: nombre, correo electrónico, teléfono.</li>
          <li>Datos del negocio: nombre comercial, giro, sucursales.</li>
          <li>
            Datos de la solicitud de demo: los que se ingresen voluntariamente en el formulario de
            contacto del sitio.
          </li>
          <li>Datos de uso de la plataforma, una vez contratado el servicio (sesión, actividad).</li>
        </ul>
      </Section>

      <Section title="4. Finalidades del tratamiento">
        <p><strong>Primarias</strong> (necesarias para el servicio):</p>
        <ul className="list-disc pl-5">
          <li>Responder solicitudes de demostración e información comercial.</li>
          <li>Crear y administrar la cuenta del negocio y la relación contractual.</li>
          <li>Prestar soporte y dar seguimiento a incidencias.</li>
        </ul>
        <p><strong>Secundarias</strong> (opcionales, con oposición disponible):</p>
        <ul className="list-disc pl-5">
          <li>Enviar comunicación comercial sobre nuevas funciones o promociones.</li>
          <li>Elaborar estadísticas internas para mejorar el servicio.</li>
        </ul>
        <p>
          Quien no desee que sus datos se usen para las finalidades secundarias puede manifestarlo por el
          medio de contacto de la sección 8, sin que esto condicione la relación con {BRAND.name}.
        </p>
      </Section>

      <Section title="5. Transferencias">
        <p>
          No vendemos ni rentamos datos personales. Podemos compartir datos con proveedores tecnológicos
          que operan la infraestructura del servicio (hosting, base de datos, autenticación, y los
          servicios de Apple Wallet / Google Wallet necesarios para emitir las tarjetas digitales),
          únicamente en la medida necesaria para prestar el servicio y bajo obligaciones de
          confidencialidad. [Pendiente: listar proveedores específicos y, si aplica, transferencias
          internacionales de datos.]
        </p>
      </Section>

      <Section title="6. Cookies y tecnologías de rastreo">
        <p>
          Este sitio de marketing no utiliza cookies de rastreo ni analítica de terceros. La plataforma
          (una vez iniciada sesión) utiliza únicamente las cookies estrictamente necesarias para mantener
          la sesión autenticada.
        </p>
      </Section>

      <Section title="7. Derechos ARCO">
        <p>
          Toda persona titular de datos personales puede solicitar acceder, rectificar, cancelar u
          oponerse (derechos ARCO) al tratamiento de sus datos, así como revocar su consentimiento,
          escribiendo al correo de la sección 8. [Pendiente: definir plazo y procedimiento exacto de
          respuesta conforme a la LFPDPPP.]
        </p>
      </Section>

      <Section title="8. Contacto">
        <p>
          Para cualquier duda sobre este aviso o para ejercer tus derechos ARCO, escribe a{" "}
          <a href={`mailto:${CONTACT.email}`} className="text-foreground underline">
            {CONTACT.email}
          </a>
          .
        </p>
      </Section>

      <Section title="9. Cambios a este aviso">
        <p>
          Este aviso puede actualizarse para reflejar cambios en el servicio o en la normativa aplicable.
          La versión vigente siempre estará disponible en esta página.
        </p>
      </Section>
    </article>
  );
}
