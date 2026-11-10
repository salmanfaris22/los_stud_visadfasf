import "./site.css";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { getSite } from "@/lib/server-api";

/** The CMS brand colour replaces the website violet. #6366f1 is the old seed default, so it is ignored. */
function brandStyle(color?: string): React.CSSProperties | undefined {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color) || color.toLowerCase() === "#6366f1") return undefined;
  return { ["--site-violet" as string]: color };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const logo = site.branding.logoUrl || undefined;
  return (
    <div className="site-skin min-h-screen" style={brandStyle(site.branding.primaryColor)}>
      <Navbar name={site.branding.name} logo={logo} signup={site.signup} />
      <main className="min-h-screen">{children}</main>
      <Footer name={site.branding.name} logo={logo} data={(site.blocks.footer ?? {}) as Record<string, string>} />
    </div>
  );
}
