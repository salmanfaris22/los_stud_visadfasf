"use client";
import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Award, BookOpen, ClipboardCheck, Mail, Pencil, Phone, ShieldCheck, Users } from "lucide-react";
import {
  Avatar, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Field, Input, Separator, Skeleton, Textarea, cn, timeAgo,
} from "@lms/ui";
import { AuthService, useRpcMutation } from "@lms/api-client";
import { ImageUpload } from "@lms/shared";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";
import { Flower } from "@/features/dashboard/lilac-art";

const box = "rounded-[24px] bg-card";
const SOFT = ["bg-[var(--lilac-soft)]", "bg-[var(--blush-soft)]", "bg-[var(--sky-soft)]", "bg-[var(--mint-soft)]"];

function EditProfile({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [p, setP] = React.useState({ name: "", phone: "", avatarUrl: "", bio: "" });
  const [pw, setPw] = React.useState({ currentPassword: "", newPassword: "" });
  React.useEffect(() => { if (me && open) setP({ name: me.name, phone: me.phone, avatarUrl: me.avatarUrl, bio: me.bio }); }, [me, open]);
  const save = useRpcMutation(AuthService.method.updateProfile, feedback(qc, "Profile saved", [AuthService.method.getMe], () => onOpenChange(false)));
  const change = useRpcMutation(AuthService.method.changePassword, feedback(qc, "Password changed", [], () => setPw({ currentPassword: "", newPassword: "" })));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Your photo, name and bio. The bio shows on public course pages for mentors.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-[8rem_1fr]" onSubmit={(e) => { e.preventDefault(); save.mutate(p); }}>
          <Field label="Photo"><ImageUpload value={p.avatarUrl} onChange={(u) => setP({ ...p, avatarUrl: u })} purpose="avatar" aspect="aspect-square" className="w-32" /></Field>
          <div className="grid gap-4">
            <Field label="Name"><Input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          </div>
          <Field label="Bio" className="sm:col-span-2"><Textarea rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
          <Button type="submit" className="w-fit sm:col-span-2" loading={save.isPending}>Save</Button>
        </form>
        <Separator className="my-2" />
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); change.mutate(pw); }}>
          <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters"><Input type="password" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <Button type="submit" variant="outline" className="w-fit" loading={change.isPending}>Update password</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, label, value, hint, href }: { icon: typeof Users; label: string; value?: number; hint?: string; href: string }) {
  return (
    <Link href={href} className={cn(box, "group p-5 transition hover:-translate-y-0.5")}>
      <div className="flex items-center gap-2.5 text-sm">
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--lilac-soft)] text-[var(--lilac-deep)]"><Icon className="size-4" /></span>
        {label}
      </div>
      {value === undefined ? <Skeleton className="mt-4 h-9 w-20" /> : <div className="mt-3 text-[34px] leading-none font-medium tracking-[-0.03em] tabular-nums">{value.toLocaleString()}</div>}
      {hint && <div className="mt-2 truncate text-xs text-muted-foreground">{hint}</div>}
    </Link>
  );
}

function WeekBars({ daily }: { daily: { day: string; approved: number; submitted: number }[] }) {
  const days = daily.slice(-7);
  const max = Math.max(...days.map((d) => d.submitted), 1);
  const total = days.reduce((a, d) => a + d.submitted, 0);
  const top = days.findIndex((d) => d.submitted === max && max > 0);
  return (
    <section className={cn(box, "p-5")}>
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-medium tracking-[-0.02em]">Tasks this week</h2>
        <span className="text-[20px] font-medium tabular-nums">{total}</span>
      </div>
      <div className="mt-5 grid h-48 grid-cols-7 gap-3">
        {days.map((d, i) => {
          const h = d.submitted ? Math.max(14, (d.submitted / max) * 100) : 0;
          const tone = i === top ? "bg-[var(--lilac)]" : i % 3 === 2 ? "bg-[var(--lilac-soft)]" : "bg-[var(--blush)]";
          return (
            <div key={d.day} className="flex flex-col items-center gap-2">
              <div className="relative flex w-full max-w-9 flex-1 items-end overflow-visible rounded-full bg-muted" title={`${d.submitted} sent · ${d.approved} approved`}>
                {i === top && <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">{d.submitted}</span>}
                <div className={cn("w-full rounded-full transition-[height] duration-700", tone)} style={{ height: `${h}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{new Date(d.day).toLocaleDateString(undefined, { weekday: "short" })}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { me, can } = useSession();
  const [edit, setEdit] = React.useState(false);
  const overview = $api.useQuery("get", "/api/v1/analytics/overview", { params: { query: { days: 30 } } }, { enabled: can("analytics") });
  const audit = $api.useQuery("get", "/api/v1/audit", { params: { query: { actor_id: me?.id, per_page: 6 } } }, { enabled: !!me && can("audit") });
  const staff = $api.useQuery("get", "/api/v1/staff", { params: { query: { per_page: 6 } } }, { enabled: can("users") });
  if (!me) return null;
  const c = overview.data?.counts;
  const modules = [...new Set(me.permissions.map((p) => p.split(":")[0]))];

  return (
    <div className="grid gap-5">
      <section className={cn(box, "overflow-hidden")}>
        <div className="relative h-32 overflow-hidden bg-gradient-to-r from-[#d0c2f4] via-[#e0d4f8] to-[#f6d3ea] dark:from-[#2d2550] dark:via-[#3a2f66] dark:to-[#4b2f4f]">
          <Flower className="absolute -top-14 right-[12%] size-60 opacity-95" />
        </div>
        <div className="flex flex-col gap-4 px-6 pb-5 sm:flex-row sm:items-end">
          <Avatar src={me.avatarUrl} name={me.name} className="-mt-12 size-[104px] bg-[var(--lilac-soft)] ring-6 ring-card [&>span]:text-2xl [&>span]:text-foreground/80" />
          <div className="min-w-0 flex-1 sm:pb-1">
            <h1 className="text-[28px] leading-tight font-medium tracking-[-0.025em]">{me.name}</h1>
            <p className="mt-0.5 text-sm">{me.isSuperAdmin ? "Super admin" : "Staff"} · LMS Admin</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="size-3.5" />{me.email}</span>
              {me.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5" />{me.phone}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 items-center gap-2 rounded-full bg-success/10 px-4 text-sm font-medium"><span className="size-2 rounded-full bg-success" />Active</span>
            <button onClick={() => setEdit(true)} className="flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90">
              <Pencil className="size-4" /> Edit profile
            </button>
          </div>
        </div>
      </section>

      {can("analytics") && (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Stat icon={BookOpen} label="Courses published" value={c?.published_courses} hint={c && `${c.active_batches} batches running`} href="/courses" />
          <Stat icon={Users} label="Students" value={c?.students} hint={c && `${c.active_students} active this week`} href="/students" />
          <Stat icon={ClipboardCheck} label="Tasks reviewed" value={c?.reviewed_submissions} hint={overview.data && `${overview.data.approval_rate}% approved`} href="/submissions" />
          <Stat icon={Award} label="Certificates" value={c?.certificates} hint={c && `${c.staff} staff on the team`} href="/certificates" />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className={cn(box, "p-5")}>
          <h2 className="text-[20px] font-medium tracking-[-0.02em]">About</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">{me.bio || "No bio yet. Use Edit profile to add a few lines about yourself."}</p>
          <div className="mt-5 text-sm font-medium">Access <span className="font-normal text-muted-foreground">{me.isSuperAdmin ? "· everything" : `· ${modules.length} areas`}</span></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {me.isSuperAdmin ? (
              <span className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"><ShieldCheck className="size-3.5" />Super admin</span>
            ) : modules.map((m, i) => (
              <span key={m} className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize", SOFT[i % SOFT.length])}>{m}</span>
            ))}
          </div>
        </section>
        {can("analytics") && (overview.data ? <WeekBars daily={overview.data.daily} /> : <Skeleton className="h-72 rounded-[24px]" />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {can("audit") && (
          <section className={cn(box, "p-5")}>
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-medium tracking-[-0.02em]">Recent activity</h2>
              <Link href="/audit" className="text-xs text-muted-foreground hover:text-foreground">Audit log</Link>
            </div>
            <ul className="mt-3 divide-y">
              {audit.isLoading && <Skeleton className="h-24" />}
              {audit.data?.items.length === 0 && <li className="py-4 text-sm text-muted-foreground">Nothing yet.</li>}
              {audit.data?.items.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="size-2 rounded-full bg-[var(--lilac)]" />
                  <span className="flex-1 truncate"><span className="capitalize">{a.action.replace(/[._]/g, " ")}</span> <span className="text-muted-foreground">{a.entity}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {can("users") && (
          <section className={cn(box, "p-5")}>
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-medium tracking-[-0.02em]">Team</h2>
              <Link href="/staff" className="text-xs text-muted-foreground hover:text-foreground">All staff</Link>
            </div>
            <ul className="mt-3 grid gap-2.5">
              {staff.isLoading && <Skeleton className="h-24" />}
              {staff.data?.items.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3">
                  <Avatar src={s.avatar_url} name={s.name} className={cn("size-9 [&>span]:text-foreground/80", SOFT[i % SOFT.length])} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.name}</div><div className="truncate text-xs text-muted-foreground">{s.is_super_admin ? "Super admin" : s.role_names.join(", ") || "Staff"}</div></div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <EditProfile open={edit} onOpenChange={setEdit} />
    </div>
  );
}
