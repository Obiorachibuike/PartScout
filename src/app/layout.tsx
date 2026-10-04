import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { appConfig } from "@/lib/config";
import { getCapabilities } from "@/lib/config";
import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { ThemeScript } from "@/components/theme/theme-script";
import { SessionProvider } from "@/components/providers/session-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  metadataBase: new URL(appConfig.appUrl),
  title: {
    default: "PartScout — phone parts compatibility research from the live web",
    template: "%s · PartScout",
  },
  description:
    "PartScout researches live public web evidence to answer which phone parts are compatible with which models. Every answer cites its sources, and anything without evidence is reported as unknown.",
  applicationName: appConfig.appName,
  keywords: [
    "phone parts compatibility",
    "phone repair parts",
    "screen compatibility",
    "charging flex compatibility",
    "battery compatibility",
    "part number lookup",
  ],
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: appConfig.appName,
    title: "PartScout — Find the right part. Verify compatibility.",
    description:
      "Live-web compatibility research for phone repair parts, with sources and evidence confidence for every finding.",
    url: appConfig.appUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PartScout — Find the right part. Verify compatibility.",
    description:
      "Live-web compatibility research for phone repair parts, with sources and evidence confidence for every finding.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070D" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7FB" },
  ],
  colorScheme: "dark light",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const capabilities = getCapabilities({ databaseConfigured: isDatabaseConfigured() });

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        <SessionProvider
          value={{
            user: session,
            capabilities,
          }}
        >
          <a
            href="#main"
            className="ps-focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--ps-surface)] focus:px-4 focus:py-2 focus:text-sm"
          >
            Skip to content
          </a>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader user={session ? { name: session.name, email: session.email } : null} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
          <Toaster
            theme="system"
            position="bottom-center"
            toastOptions={{
              style: {
                background: "var(--ps-surface)",
                color: "var(--ps-text)",
                border: "1px solid var(--ps-border)",
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
