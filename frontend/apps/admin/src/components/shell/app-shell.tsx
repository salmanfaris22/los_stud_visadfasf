"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, LogOut, Menu, Moon, Search, Sun, User } from "lucide-react";

import {
  Avatar, BrandMark, Button, Dialog, DialogContent, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, SheetContent, Skeleton, ThemeToggle, cn, useTheme,
} from "@lms/ui";
import { AuthService, useRpcMutation } from "@lms/api-client";
import { NAV, type NavItem } from "@/lib/nav";
import { SessionProvider, useSession } from "@/lib/session";
import { NotificationBell } from "@lms/shared";

function useItems() {
  const { can } = useSession();
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.module || can(i.module)) })).filter((g) => g.items.length);
}

/* Sidebar sits on the ink "control room" rail; `dark` scopes the night tokens to it in both themes. */
function SidebarNav({ onNavigate, id }: { onNavigate?: () => void; id: string }) {
  const path = usePathname();
  const groups = useItems();
  return (
    <nav className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-2 text-xs font-semibold text-rail-muted">{group.label}</div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = path === item.href || path.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={cn("relative flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                    active ? "text-rail-foreground" : "text-rail-muted hover:bg-rail-accent/70 hover:text-rail-foreground")}>
                  {active && <motion.span layoutId={`admin-nav-${id}`} transition={{ type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-0 rounded-full bg-rail-accent" />}
                  <span className={cn("relative z-10 flex size-7 items-center justify-center rounded-full", active && "bg-signal text-signal-foreground")}><item.icon className="size-4" /></span>
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2 font-display text-lg font-extrabold text-rail-foreground">
      <BrandMark className="bg-rail-foreground [&>span]:shadow-[0_0_0_2.5px_var(--rail)]" />
      LMS <span className="rounded-full bg-signal px-2 py-0.5 font-sans text-[10px] font-bold text-signal-foreground">Admin</span>
    </Link>
  );
}

/** ⌘K command menu over every page the user can open. */
function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const groups = useItems();
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const flat: (NavItem & { group: string })[] = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
    .filter((i) => (i.label + " " + i.group).toLowerCase().includes(q.toLowerCase()));
  React.useEffect(() => setSel(0), [q]);
  React.useEffect(() => { if (!open) setQ(""); }, [open]);
  const go = (href: string) => { onOpenChange(false); router.push(href); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:p-0" size="md">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <div className="flex items-center gap-3 border-b px-5">
          <Search className="size-5 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to…" className="h-14 flex-1 bg-transparent text-[15px] outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && flat[sel]) go(flat[sel]!.href);
            }} />
          <kbd className="rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {flat.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing found</p>}
          {flat.map((it, i) => (
            <button key={it.href} onMouseEnter={() => setSel(i)} onClick={() => go(it.href)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium", i === sel && "bg-muted")}>
              <span className={cn("flex size-8 items-center justify-center rounded-full bg-muted", i === sel && "bg-signal text-signal-foreground")}><it.icon className="size-4" /></span>
              <span className="flex-1">{it.label}</span>
              <span className="text-xs text-muted-foreground">{it.group}</span>
              {i === sel && <ArrowRight className="size-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Tip = { label: string; y: number } | null;

/** Hover/focus label for a rail icon. Drawn outside the scrolling rail so it is never clipped. */
function useRailTip() {
  const [tip, setTip] = React.useState<Tip>(null);
  const bind = (label: string) => {
    const show = (e: React.SyntheticEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, y: r.top + r.height / 2 });
    };
    return { onMouseEnter: show, onFocus: show, onMouseLeave: () => setTip(null), onBlur: () => setTip(null) };
  };
  return { tip, bind, hide: () => setTip(null) };
}

/** Floating ink rail: icon-only nav, lavender disc on the current page, label on hover. */
function Rail({ onSearch, onLogout }: { onSearch: () => void; onLogout: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const groups = useItems();
  const { me } = useSession();
  const { tip, bind, hide } = useRailTip();
  const { resolvedTheme, setTheme } = useTheme();
  if (!me) return null;
  const iconBtn = "relative flex size-11 shrink-0 items-center justify-center rounded-full text-rail-muted transition-colors hover:bg-rail-accent hover:text-rail-foreground [&_svg]:size-[19px] [&_svg]:stroke-[1.75]";
  return (
    <>
      <aside className="dark fixed top-4 bottom-4 left-4 z-40 hidden w-[68px] flex-col items-center rounded-[34px] bg-rail py-5 shadow-[0_18px_40px_-18px_rgb(20_19_24/0.55)] lg:flex">
        <Link href="/dashboard" aria-label="Dashboard" className="mb-5 flex size-11 shrink-0 items-center justify-center" {...bind("LMS Admin")}>
          <BrandMark className="bg-rail-foreground [&>span]:shadow-[0_0_0_2.5px_var(--rail)]" />
        </Link>
        <nav className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto py-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)] pb-6" onScroll={hide} aria-label="Main">
          {groups.map((group, gi) => (
            <React.Fragment key={group.label}>
              {gi > 0 && <span className="my-1 h-px w-6 shrink-0 bg-rail-border" aria-hidden />}
              {group.items.map((item) => {
                const active = path === item.href || path.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined} {...bind(item.label)}
                    className={cn(iconBtn, active && "text-signal-foreground hover:bg-transparent hover:text-signal-foreground")}>
                    {active && <motion.span layoutId="rail-active" transition={{ type: "spring", stiffness: 520, damping: 40 }} className="absolute inset-0 rounded-full bg-signal" />}
                    <item.icon className="relative z-10" />
                  </Link>
                );
              })}
            </React.Fragment>
          ))}
        </nav>
        <div className="mt-1 flex shrink-0 flex-col items-center gap-1.5">
          <button onClick={onSearch} aria-label="Jump to a page (⌘K)" className={iconBtn} {...bind("Search  ⌘K")}><Search /></button>
          <button onClick={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); hide(); }} aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className={iconBtn} {...bind(resolvedTheme === "dark" ? "Light theme" : "Dark theme")}>
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </button>
          <span {...bind("Notifications")} className="[&_button]:size-11 [&_button]:rounded-full [&_button]:text-rail-muted [&_button:hover]:text-rail-foreground"><NotificationBell enabled={!!me} /></span>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full outline-none ring-offset-2 ring-offset-rail focus-visible:ring-2 focus-visible:ring-signal" aria-label="Account menu" {...bind(me.name)}>
              <Avatar src={me.avatarUrl} name={me.name} className="size-10 ring-2 ring-rail-border" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={14} className="w-60">
              <DropdownMenuLabel>
                <div className="font-semibold text-foreground">{me.name}</div>
                <div className="truncate font-normal">{me.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/profile")}><User /> Profile</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={onLogout}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={onLogout} aria-label="Sign out" className={iconBtn} {...bind("Sign out")}><LogOut /></button>
        </div>
      </aside>
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed left-[98px] z-50 hidden -translate-y-1/2 animate-fade-in items-center lg:flex" style={{ top: tip.y }}>
          <span className="rounded-lg bg-rail px-2.5 py-1.5 text-xs font-medium whitespace-pre text-rail-foreground shadow-lg dark:ring-1 dark:ring-rail-border">{tip.label}</span>
        </div>
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const logoutRpc = useRpcMutation(AuthService.method.logout);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [cmd, setCmd] = React.useState(false);

  React.useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, me, router]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = async () => {
    await logoutRpc.mutateAsync({}).catch(() => {});
    window.location.href = "/login";
  };

  if (loading || !me) {
    return (
      <div className="min-h-screen lg:pl-[100px]">
        <div className="fixed top-4 bottom-4 left-4 hidden w-[68px] rounded-[34px] bg-rail lg:block" />
        <div className="space-y-4 p-4 sm:p-6 lg:py-4 lg:pr-6"><Skeleton className="h-36 w-full rounded-[24px]" /><Skeleton className="h-64 w-full rounded-[24px]" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Rail onSearch={() => setCmd(true)} onLogout={logout} />
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="dark border-rail-border bg-rail">
          <Brand />
          <SidebarNav onNavigate={() => setOpen(false)} id="drawer" />
        </SheetContent>
      </Dialog>
      <CommandMenu open={cmd} onOpenChange={setCmd} />
      {/* Phones and tablets: a slim top bar opens the full menu. */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-xl lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
        <Link href="/dashboard" className="flex items-center gap-2 font-display text-lg font-extrabold"><BrandMark />LMS</Link>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={() => setCmd(true)} aria-label="Search"><Search /></Button>
        <ThemeToggle />
        <NotificationBell enabled={!!me} />
        <Link href="/profile" aria-label="Profile"><Avatar src={me.avatarUrl} name={me.name} /></Link>
      </header>
      <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:py-5 lg:pr-6 lg:pl-[108px]">{children}</main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
