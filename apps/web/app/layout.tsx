import type { ReactNode } from "react";
import { Comfortaa, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

// Identidad Pragmia (reemplaza Space Grotesk/Inter de "Sello"): Playfair
// Display para display/títulos (serif, el "TYPO 1" del kit de marca —
// misma familia que el wordmark del logo) + Comfortaa para cuerpo (sans
// geométrica redondeada, "typo 2"). Auto-hosted por Next en build time —
// cero request a Google Fonts en runtime, mismo criterio de "sin CDN de
// terceros" que ya rige el resto del proyecto.
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-playfair-display",
  display: "swap",
});

const comfortaa = Comfortaa({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-comfortaa",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${playfairDisplay.variable} ${comfortaa.variable}`}>
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
