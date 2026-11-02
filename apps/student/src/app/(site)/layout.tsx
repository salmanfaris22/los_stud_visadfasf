import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { getSite } from "@/lib/server-api";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  return (
    <>
      <Navbar name={site.branding.name} logo={site.branding.logo_url || undefined} signup={site.signup} />
      <main className="min-h-screen">{children}</main>
      <Footer name={site.branding.name} logo={site.branding.logo_url || undefined} data={(site.blocks.footer ?? {}) as Record<string, string>} />
    </>
  );
}
