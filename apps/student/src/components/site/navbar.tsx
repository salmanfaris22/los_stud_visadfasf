"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { GraduationCap, Menu, X } from "lucide-react";
import { Button, ThemeToggle, cn } from "@lms/ui";
import { $api } from "@/lib/api";

const LINKS = [{ href: "/courses", label: "Courses" }, { href: "/blog", label: "Blog" }, { href: "/contact", label: "Contact" }];

export function Brand({ name, logo }: { name: string; logo?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name} className="h-8 w-auto" />
      ) : (
        <span className="rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 p-1.5 text-white shadow-lg shadow-primary/30"><GraduationCap className="size-5" /></span>
      )}
      <span>{name}</span>
    </Link>
  );
}

export function Navbar({ name, logo, signup }: { name: string; logo?: string; signup: boolean }) {
  const path = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));
  const me = $api.useQuery("get", "/api/v1/auth/me", {}, { retry: false, staleTime: 60_000 });
  return (
    <motion.header initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}
      className={cn("fixed inset-x-0 top-0 z-50 transition-all", scrolled ? "border-b bg-background/75 py-2 backdrop-blur-xl" : "py-4")}>
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Brand name={name} logo={logo} />
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cn("rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground", path.startsWith(l.href) && "text-foreground")}>{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {me.data ? (
            <Button asChild><Link href="/learn">My learning</Link></Button>
          ) : (
            <>
              <Button variant="ghost" asChild className="hidden sm:inline-flex"><Link href="/login">Sign in</Link></Button>
              {signup && <Button asChild className="hidden sm:inline-flex"><Link href="/register">Get started</Link></Button>}
            </>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</Button>
        </div>
      </div>
      {open && (
        <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-4 mt-2 grid gap-1 rounded-2xl border bg-popover p-3 shadow-xl md:hidden">
          {LINKS.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm hover:bg-accent">{l.label}</Link>)}
          {!me.data && <Link href="/login" className="rounded-lg px-3 py-2 text-sm hover:bg-accent">Sign in</Link>}
          {!me.data && signup && <Button asChild className="mt-1"><Link href="/register">Get started</Link></Button>}
        </motion.nav>
      )}
    </motion.header>
  );
}
