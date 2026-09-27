import "./globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Scrapio - Sistema RAG Multi-Tenant",
  description: "Plataforma de Scraping y RAG Multi-Tenant Serverless aislada por cliente",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
