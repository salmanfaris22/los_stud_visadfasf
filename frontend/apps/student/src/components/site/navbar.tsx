"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { AuthService, useRpcQuery } from "@lms/api-client";
import { ThemeToggle, cn } from "@lms/ui";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/courses", label: "Courses" },
  { href: "/blog", label: "Blog" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/** Default mark: a play button inside a ring (video lessons). */
export function SiteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M13.2 11.2v9.6c0 .8.86 1.28 1.54.86l7.6-4.8a1 1 0 0 0 0-1.72l-7.6-4.8c-.68-.42-1.54.06-1.54.86Z" fill="currentColor" />
    </svg>
  );
}

export function Brand({ name, logo }: { name: string; logo?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-full text-[22px] font-bold tracking-[-0.035em] text-[var(--site-violet)]">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-8 w-auto" />
      ) : (
        <SiteMark />
      )}
      <span>{name}</span>
    </Link>
  );
}

export function Navbar({ name, logo, signup }: { name: string; logo?: string; signup: boolean }) {
  const path = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const me = useRpcQuery(AuthService.method.getMe, {}, { retry: false, staleTime: 60_000, select: (r) => r.me });

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  React.useEffect(() => setOpen(false), [path]);

  const active = (href: string) => !href.startsWith("/#") && path.startsWith(href);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 bg-background/85 backdrop-blur-xl transition-shadow", scrolled && "shadow-[0_1px_0_var(--border),0_8px_24px_-18px_rgb(var(--site-shadow)/0.35)]")}>
      <div className="mx-auto grid h-[72px] max-w-7xl grid-cols-[1fr_auto] items-center gap-6 px-4 sm:px-6 md:h-[76px] lg:grid-cols-[1fr_auto_1fr]">
        <Brand name={name} logo={logo} />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}
              className={cn("rounded-full px-4 py-2 text-[16px] font-medium transition-colors hover:text-foreground", active(l.href) ? "text-foreground" : "text-foreground/70")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <ThemeToggle />
          {me.data ? (
            <Link href="/learn" className="site-btn site-btn-md site-btn-violet hidden sm:inline-flex">My learning</Link>
          ) : (
            <>
              <Link href="/login" className="site-btn site-btn-md site-btn-light hidden sm:inline-flex">Sign in</Link>
              {signup && <Link href="/register" className="site-btn site-btn-md site-btn-violet hidden sm:inline-flex">Get started</Link>}
            </>
          )}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close menu" : "Menu"}
            className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-[var(--site-violet)] lg:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <motion.nav aria-label="Mobile" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
          className="mx-4 mb-3 grid gap-1 rounded-[24px] border bg-popover p-3 shadow-xl lg:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-full px-4 py-2.5 text-[15px] font-medium hover:bg-accent">{l.label}</Link>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {me.data ? (
              <Link href="/learn" className="site-btn site-btn-md site-btn-violet col-span-2">My learning</Link>
            ) : (
              <>
                <Link href="/login" className={cn("site-btn site-btn-md site-btn-light", !signup && "col-span-2")}>Sign in</Link>
                {signup && <Link href="/register" className="site-btn site-btn-md site-btn-violet">Get started</Link>}
              </>
            )}
          </div>
        </motion.nav>
      )}
    </header>
  );
}
