import { buildWhatsappLink } from "../../../lib/marketing/content";

// Botón flotante fijo, visible en todas las secciones (position: fixed,
// no scroll-dependent). Sin "use client": es un <a> sin estado ni
// interactividad propia, así que no le quita a las páginas de marketing
// su renderizado estático (ver regla de caché en CLAUDE.md). z-40, por
// debajo del Toaster (top-right, sonner, z-alto por defecto) — no hay
// colisión posible ya que ocupan esquinas opuestas.
//
// Ícono: SVG del logo de WhatsApp a mano (glifo del audífono en burbuja),
// no un ícono genérico de lucide-react — la marca no trae un ícono de
// WhatsApp real, y agregar una librería de brand-icons solo para este
// botón no se justifica. Verde de marca de WhatsApp (#25D366), no un
// token de Pragmia: es la marca del propio ícono, no un acento nuevo del
// sistema de diseño.
export function WhatsAppFloatButton() {
  const href = buildWhatsappLink();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chatea con nosotros por WhatsApp"
      className="press fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-token-lg transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
    >
      <svg viewBox="0 0 32 32" className="size-8" fill="currentColor" aria-hidden="true">
        <path d="M16.004 4C9.377 4 4 9.373 4 16c0 2.235.617 4.42 1.789 6.323L4 28l5.844-1.75A11.94 11.94 0 0 0 16.004 28C22.63 28 28 22.627 28 16S22.63 4 16.004 4Zm0 21.818a9.78 9.78 0 0 1-4.992-1.367l-.358-.213-3.47 1.04 1.06-3.38-.234-.35A9.78 9.78 0 0 1 6.18 16c0-5.42 4.408-9.818 9.824-9.818S25.82 10.58 25.82 16s-4.408 9.818-9.816 9.818Zm5.373-7.349c-.294-.148-1.741-.86-2.011-.958-.27-.098-.467-.148-.664.148-.196.295-.762.958-.934 1.155-.172.196-.343.221-.637.074-.294-.148-1.242-.458-2.366-1.462-.874-.78-1.464-1.744-1.636-2.038-.172-.295-.018-.454.129-.601.133-.132.294-.344.441-.516.147-.172.196-.295.294-.491.098-.197.049-.369-.024-.516-.074-.148-.663-1.599-.909-2.189-.24-.575-.483-.497-.663-.507l-.565-.01c-.196 0-.516.074-.786.369-.27.295-1.03 1.007-1.03 2.457s1.055 2.85 1.202 3.047c.147.196 2.077 3.171 5.033 4.446.703.303 1.252.484 1.68.62.706.225 1.348.193 1.856.117.566-.084 1.741-.712 1.987-1.4.245-.688.245-1.278.172-1.4-.073-.123-.269-.196-.564-.344Z" />
      </svg>
    </a>
  );
}
