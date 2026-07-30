import type { ReactNode } from "react";
import "./globals.css";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
