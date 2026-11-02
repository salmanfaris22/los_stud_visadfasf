import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_URL, getSite } from "@/lib/server-api";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-family" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display-family" });

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const name = site.branding.name;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${site.branding.tagline}`, template: `%s · ${name}` },
    description: (site.blocks.hero?.subtitle as string) ?? "Video lessons, mentor-reviewed tasks, live classes and certificates.",
    openGraph: { type: "website", siteName: name },
    icons: site.branding.logo_url ? { icon: site.branding.logo_url } : undefined,
  };
}

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0e0e14" }, { color: "#ffffff" }] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const brand = site.branding.primary_color;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>{brand && /^#[0-9a-fA-F]{6}$/.test(brand) && brand.toLowerCase() !== "#6366f1" && <style>{`:root,.dark{--primary:${brand};--ring:${brand}}`}</style>}</head>
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
