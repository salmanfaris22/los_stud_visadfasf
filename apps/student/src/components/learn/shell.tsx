"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Award, BookOpen, CalendarDays, ClipboardList, GraduationCap, Home, LogOut, Megaphone, Menu, QrCode, Search, User, Video,
} from "lucide-react";
import { NotificationBell } from "@lms/shared";
import {
  Avatar, Button, Dialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  SheetContent, Skeleton, ThemeToggle, cn,
} from "@lms/ui";
import { api } from "@/lib/api";
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

function SideNav({ mini, onNavigate }: { mini?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={onNavigate} title={n.label}
          className={cn("flex items-center rounded-xl text-sm transition", mini ? "flex-col gap-1 px-1 py-3 text-[10px]" : "gap-4 px-3 py-2.5",
            isActive(path, n.href, n.exact) ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
          <n.icon className={cn(mini ? "size-5" : "size-5", isActive(path, n.href, n.exact) && "text-primary")} />
          <span className={cn(mini && "max-w-full truncate")}>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [mini, setMini] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [q, setQ] = React.useState("");
  const watching = path.startsWith("/learn/watch");

  React.useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [loading, me, router]);
  React.useEffect(() => {
    setMini(watching);
  }, [watching]);

  if (loading || !me) return <div className="space-y-4 p-8"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;

  const logout = async () => {
    await api.client.POST("/api/v1/auth/logout");
    window.location.href = "/login";
  };
  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 bg-background/90 px-3 backdrop-blur-xl sm:px-4">
        <Button variant="ghost" size="icon" onClick={() => (window.innerWidth >= 768 ? setMini(!mini) : setDrawer(true))} aria-label="Menu"><Menu /></Button>
        <Link href="/learn" className="mr-2 flex items-center gap-2 font-display font-bold">
          <span className="rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 p-1 text-white"><GraduationCap className="size-5" /></span>
          <span className="hidden sm:inline">LMS</span>
        </Link>
        <form className="mx-auto hidden w-full max-w-xl md:flex" onSubmit={(e) => { e.preventDefault(); router.push(`/learn/courses?q=${encodeURIComponent(q)}`); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your courses" className="h-10 flex-1 rounded-l-full border bg-background px-4 text-sm outline-none focus:border-primary" />
          <button className="flex h-10 w-14 items-center justify-center rounded-r-full border border-l-0 bg-muted hover:bg-accent" aria-label="Search"><Search className="size-4" /></button>
        </form>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell enabled viewAllHref="/learn/notifications" />
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-1 rounded-full outline-none" aria-label="Account"><Avatar src={me.avatar_url} name={me.name} className="size-8" /></DropdownMenuTrigger>
            <DropdownMenuContent className="w-60">
              <DropdownMenuLabel><span className="block font-medium text-foreground">{me.name}</span><span className="block truncate font-normal">{me.email}</span><span className="font-mono text-[11px]">{me.student_code}</span></DropdownMenuLabel>
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
        <aside className={cn("sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto px-2 pb-6 md:block", mini ? "w-[76px]" : "w-60")}>
          <SideNav mini={mini} />
        </aside>
        <main className={cn("min-w-0 flex-1 px-4 pb-10 sm:px-6", watching ? "pt-4" : "pt-6")}>{children}</main>
      </div>
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left"><SideNav onNavigate={() => setDrawer(false)} /></SheetContent>
      </Dialog>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden">
        {MOBILE.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", isActive(path, n.href, n.href === "/learn") ? "text-primary" : "text-muted-foreground")}>
            <n.icon className="size-5" />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function LearnShell({ children }: { children: React.ReactNode }) {
  return <SessionProvider><Shell>{children}</Shell></SessionProvider>;
}
