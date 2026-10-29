import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Nav } from "@/components/Nav";
import { SandboxProvider } from "@/components/Sandbox";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Prism API", template: "%s · Prism API" },
  description: "A public GraphQL and REST platform with keys, docs and limits developers actually enjoy.",
};

export const viewport: Viewport = { themeColor: "#F7F4F2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SandboxProvider>
        <Nav />
        <main id="main">{children}</main>
        <footer className="mt-24 border-t border-line">
          <div className="mx-auto flex max-w-page flex-col gap-3 px-5 py-8 text-[14px] text-muted sm:flex-row sm:justify-between sm:px-8 lg:px-12">
            <p>Prism API</p>
            <p>
              <a className="hover:text-ink" href="/api/schema">Schema</a>
              <span className="px-2">/</span>
              <a className="hover:text-ink" href="/api/sdk">TypeScript SDK</a>
              <span className="px-2">/</span>
              <a className="hover:text-ink" href="/api/health">Status</a>
            </p>
          </div>
        </footer>
        </SandboxProvider>
      </body>
    </html>
  );
}
