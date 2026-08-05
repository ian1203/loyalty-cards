import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

// Auto-hosted por Next en build time (next/font/google descarga una vez al
// compilar y sirve los archivos desde el propio dominio) — cero request a
// Google Fonts en runtime, mismo criterio de "sin CDN de terceros" que ya
// rige el resto del proyecto (ver skill artifact-design, que bloquea
// exactamente esto para los Artifacts).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <ServiceWorkerRegister />
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              toast: "rounded-lg border border-border bg-card text-card-foreground shadow-token-md font-sans",
              title: "font-medium",
              description: "text-muted-foreground",
              success: "!text-success",
              error: "!text-destructive",
            },
          }}
        />
      </body>
    </html>
  );
}
