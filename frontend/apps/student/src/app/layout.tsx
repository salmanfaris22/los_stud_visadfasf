import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_URL, getSite } from "@/lib/server-api";

// Mona Sans with its width axis: headings use the Expanded cut (font-stretch 125%).
const sans = Mona_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-sans-family", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const name = site.branding.name;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${site.branding.tagline}`, template: `%s · ${name}` },
    description: (site.blocks.hero?.subtitle as string) ?? "Video lessons, mentor-reviewed tasks, live classes and certificates.",
    openGraph: { type: "website", siteName: name },
    icons: site.branding.logoUrl ? { icon: site.branding.logoUrl } : undefined,
  };
}

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0e1424" }, { color: "#f4f5f7" }] };

/** Ink or white, whichever reads better on the brand colour. */
function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#15171e" : "#ffffff";
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const brand = site.branding.primaryColor;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The CMS brand colour replaces the yellow "signal" (main buttons, current stop). #6366f1 is the old seed default. */}
        {brand && /^#[0-9a-fA-F]{6}$/.test(brand) && brand.toLowerCase() !== "#6366f1" && (
          <style>{`:root,.dark{--signal:${brand};--signal-strong:color-mix(in oklab,${brand} 88%,#000);--signal-foreground:${textOn(brand)}}`}</style>
        )}
      </head>
      <body className={`${sans.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
