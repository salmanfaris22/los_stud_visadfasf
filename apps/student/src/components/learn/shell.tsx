"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight, Award, BookOpen, CalendarDays, ClipboardList, Home, LogOut, Megaphone, Menu, PanelLeft, QrCode, Search, User, Video,
} from "lucide-react";
import { NotificationBell } from "@lms/shared";
import {
  Avatar, BrandMark, Button, Dialog, DialogContent, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, SheetContent, Skeleton, ThemeToggle, cn,
} from "@lms/ui";
import { AuthService, useRpcMutation } from "@lms/api-client";
import { SessionProvider, useSession } from "@/lib/session";

const NAV = [
  { href: "/learn", label: "Home", icon: Home, exact: true },
  { href: "/learn/courses", label: "My courses", icon: BookOpen },
  { href: "/learn/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/learn/live", label: "Live classes", icon: Video },
  { href: "/learn/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/learn/certificates", label: "Certificates", icon: Award },
  { href: "/learn/announcements", label: "Announcements", icon: Megaphone },
  { href: "/learn/attendance", label: "Attendance", icon: QrCode },
];

const MOBILE = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[3]!, { href: "/learn/profile", label: "Profile", icon: User }];

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

function SideNav({ mini, onNavigate, id }: { mini?: boolean; onNavigate?: () => void; id: string }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = isActive(path, n.href, n.exact);
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} title={n.label} aria-current={active ? "page" : undefined}
            className={cn("relative flex items-center rounded-full text-sm font-semibold transition-colors",
              mini ? "flex-col gap-1 rounded-2xl px-1 py-3 text-[10px]" : "gap-3 px-3.5 py-2.5",
              active ? "text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}>
            {active && (
              <motion.span layoutId={`nav-${id}`} transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className={cn("absolute inset-0 -z-0 bg-muted", mini ? "rounded-2xl" : "rounded-full")} />
            )}
            <span className={cn("relative z-10 flex items-center justify-center rounded-full transition-colors", mini ? "size-9" : "size-7", active && "bg-signal text-signal-foreground")}>
              <n.icon className="size-[18px]" />
            </span>
            <span className={cn("relative z-10", mini && "max-w-full truncate")}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** ⌘K: jump to any page or search your courses. */
function QuickJump({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const items = [
    ...(q.trim() ? [{ href: `/learn/courses?q=${encodeURIComponent(q.trim())}`, label: `Search courses for “${q.trim()}”`, icon: Search }] : []),
    ...NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())),
    ...("profile".includes(q.toLowerCase()) ? [{ href: "/learn/profile", label: "Profile", icon: User }] : []),
  ];
  React.useEffect(() => setSel(0), [q]);
  React.useEffect(() => { if (!open) setQ(""); }, [open]);
  const go = (href: string) => { onOpenChange(false); router.push(href); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:p-0" size="md">
        <DialogTitle className="sr-only">Quick jump</DialogTitle>
        <div className="flex items-center gap-3 border-b px-5">
          <Search className="size-5 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses or jump to…" className="h-14 flex-1 bg-transparent text-[15px] outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && items[sel]) go(items[sel]!.href);
            }} />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing found</p>}
          {items.map((it, i) => (
            <button key={it.href} onMouseEnter={() => setSel(i)} onClick={() => go(it.href)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium", i === sel && "bg-muted")}>
              <span className={cn("flex size-8 items-center justify-center rounded-full bg-muted", i === sel && "bg-signal text-signal-foreground")}><it.icon className="size-4" /></span>
              <span className="flex-1">{it.label}</span>
              {i === sel && <ArrowRight className="size-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const logoutRpc = useRpcMutation(AuthService.method.logout);
  const router = useRouter();
  const path = usePathname();
  const [mini, setMini] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [jump, setJump] = React.useState(false);
  const watching = path.startsWith("/learn/watch");

  React.useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [loading, me, router]);
  React.useEffect(() => {
    setMini(watching);
  }, [watching]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setJump((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !me) return <div className="space-y-4 p-8"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;

  const logout = async () => {
    await logoutRpc.mutateAsync({}).catch(() => {});
    window.location.href = "/login";
  };
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-xl sm:px-5">
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setMini(!mini)} aria-label="Collapse menu"><PanelLeft /></Button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Menu"><Menu /></Button>
        <Link href="/learn" className="mr-2 flex items-center gap-2.5 font-display text-[17px] font-extrabold">
          <BrandMark />
          <span className="hidden sm:inline">LMS</span>
        </Link>
        <button onClick={() => setJump(true)} className="mx-auto hidden h-11 w-full max-w-md items-center gap-3 rounded-full border bg-card px-4 text-sm text-muted-foreground shadow-xs transition hover:border-foreground/30 md:flex">
          <Search className="size-4" /> Search your courses
          <kbd className="ml-auto rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setJump(true)} aria-label="Search"><Search /></Button>
          <ThemeToggle />
          <NotificationBell enabled viewAllHref="/learn/notifications" />
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-1 rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account"><Avatar src={me.avatarUrl} name={me.name} className="size-9" /></DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuLabel><span className="block font-semibold text-foreground">{me.name}</span><span className="block truncate font-normal">{me.email}</span><span className="font-mono text-[11px]">{me.studentCode}</span></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/learn/profile")}><User /> Profile</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/learn/certificates")}><Award /> Certificates</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/")}><Home /> Website</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={logout}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="flex">
        <aside className={cn("sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col overflow-y-auto border-r bg-sidebar px-3 pt-4 pb-6 transition-[width] duration-200 md:flex", mini ? "w-[84px] px-2" : "w-64")}>
          <SideNav mini={mini} id="side" />
          {!mini && (
            <div className="mt-auto rounded-[18px] border bg-background p-4 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-semibold text-foreground"><span className="size-2.5 rounded-full border-2 border-foreground bg-signal" />Signed in</div>
              <span className="block truncate">{me.name}</span>
              <span className="font-mono">{me.studentCode}</span>
            </div>
          )}
        </aside>
        <main className={cn("min-w-0 flex-1 px-4 pb-12 sm:px-6 lg:px-8", watching ? "pt-4" : "pt-7")}>{children}</main>
      </div>
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left">
          <div className="mb-2 flex items-center gap-2.5 px-2 pt-1 font-display text-lg font-extrabold"><BrandMark /> LMS</div>
          <SideNav onNavigate={() => setDrawer(false)} id="drawer" />
        </SheetContent>
      </Dialog>
      <QuickJump open={jump} onOpenChange={setJump} />
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 md:hidden">
        <div className="pointer-events-auto grid grid-cols-5 rounded-full border bg-card/95 p-1 shadow-xl backdrop-blur">
        {MOBILE.map((n) => {
          const active = isActive(path, n.href, n.href === "/learn");
          return (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("flex h-7 w-11 items-center justify-center rounded-full transition", active && "bg-signal text-signal-foreground")}><n.icon className="size-[18px]" /></span>
              {n.label}
            </Link>
          );
        })}
        </div>
      </nav>
    </div>
  );
}

export function LearnShell({ children }: { children: React.ReactNode }) {
  return <SessionProvider><Shell>{children}</Shell></SessionProvider>;
}
