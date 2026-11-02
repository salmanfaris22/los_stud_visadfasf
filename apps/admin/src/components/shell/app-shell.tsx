"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, LogOut, Menu, User } from "lucide-react";
import {
  Avatar, Button, Dialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, SheetContent, Skeleton, ThemeToggle, cn,
} from "@lms/ui";
import { api } from "@/lib/api";
import { NAV } from "@/lib/nav";
import { SessionProvider, useSession } from "@/lib/session";
import { NotificationBell } from "@lms/shared";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { can } = useSession();
  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.module || can(i.module));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</div>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = path === item.href || path.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-3 font-display text-lg font-bold">
      <span className="rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 p-1.5 text-white"><GraduationCap className="size-5" /></span>
      LMS <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">ADMIN</span>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, me, router]);

  const logout = async () => {
    await api.client.POST("/api/v1/auth/logout");
    window.location.href = "/login";
  };

  if (loading || !me) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r p-4 lg:block"><Skeleton className="h-8 w-32" /></div>
        <div className="flex-1 space-y-4 p-8"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-sidebar px-3 py-5 lg:flex">
        <Brand />
        <SidebarNav />
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <Brand />
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Dialog>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <div className="flex-1" />
          <ThemeToggle />
          <NotificationBell enabled={!!me} />
          <DropdownMenu>
            <DropdownMenuTrigger className="ml-1 rounded-full outline-none" aria-label="Account menu">
              <Avatar src={me.avatar_url} name={me.name} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>
                <div className="font-medium text-foreground">{me.name}</div>
                <div className="truncate font-normal">{me.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/profile")}><User /> Profile</DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={logout}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
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
