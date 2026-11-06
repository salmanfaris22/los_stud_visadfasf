/*
 * Small pictures of the product for the features grid: each one shows the feature the way a learner
 * meets it in the app, instead of a generic icon. Keyed by the CMS feature icon name.
 */
import * as React from "react";
import { Award, BookOpen, Check, CheckCircle2, Clock3, Link2, MapPin, MonitorPlay, Sparkles, Video } from "lucide-react";
import { cn } from "@lms/ui";

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M7 4.8v14.4c0 .9.97 1.45 1.74.98l11.5-7.2a1.15 1.15 0 0 0 0-1.96L8.74 3.82C7.97 3.35 7 3.9 7 4.8Z" />
    </svg>
  );
}

function VideoVignette({ wide }: { wide?: boolean }) {
  const playlist: { title: string; time: string; state: "done" | "now" | "next" }[] = [
    { title: "Setting up Go", time: "6:20", state: "done" },
    { title: "Your first handler", time: "9:05", state: "done" },
    { title: "Routing", time: "11:30", state: "now" },
    { title: "Middleware", time: "8:42", state: "next" },
  ];
  return (
    <div className="flex h-full gap-4">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-[#1c1830]">
        <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_25%_15%,rgb(139_107_255/0.5),transparent_70%),radial-gradient(60%_60%_at_90%_100%,rgb(232_103_156/0.35),transparent_70%)]" />
        <span className="absolute top-3 left-3 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90">Lesson 3: Routing</span>
        <span className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg">
          <PlayGlyph className="ml-1 size-5 fill-[var(--site-violet)]" />
        </span>
        <div className="absolute inset-x-3 bottom-3">
          <div className="h-1.5 rounded-full bg-white/20"><div className="h-full w-[38%] rounded-full bg-[var(--site-violet)]" /></div>
          <div className="mt-1.5 flex justify-between text-[10px] font-medium text-white/70"><span>4:12</span><span>11:30</span></div>
        </div>
      </div>
      {wide && (
        <ol className="hidden w-[46%] content-center gap-2 sm:grid">
          {playlist.map((l) => (
            <li key={l.title} className={cn("flex items-center gap-3 rounded-xl border bg-card px-3 py-2", l.state === "now" && "border-[var(--site-violet-line)] bg-[var(--site-violet-soft)]")}>
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", l.state === "done" ? "bg-[var(--site-violet)] text-white" : l.state === "now" ? "bg-card text-[var(--site-violet)] ring-1 ring-[var(--site-violet-line)]" : "bg-muted text-muted-foreground")}>
                {l.state === "done" ? <Check className="size-3.5" /> : <PlayGlyph className="ml-0.5 size-3 fill-current" />}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", l.state === "next" && "text-muted-foreground")}>{l.title}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{l.time}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ReviewVignette() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold">Share your repo</span>
          <span className="shrink-0 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Approved</span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground"><Link2 className="size-3.5 shrink-0" /><span className="truncate">github.com/priya/todo-api</span></div>
      </div>
      <div className="flex items-end gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#bfe3ff] to-[#9db8ff] text-[11px] font-bold text-[#1f2b5c]">AK</span>
        <div className="rounded-2xl rounded-bl-md bg-[var(--site-violet)] px-3 py-2 text-[12px] leading-snug text-white">Clean handlers, good tests. 9/10</div>
      </div>
    </div>
  );
}

function LiveVignette() {
  const rows = [
    { day: "Thu", date: "14", title: "Live Q&A", time: "7:00 PM on Google Meet", join: true },
    { day: "Sat", date: "16", title: "Project review", time: "10:30 AM in the classroom", join: false },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      {rows.map((r) => (
        <div key={r.title} className="flex items-center gap-3 rounded-2xl border bg-card p-2.5 pr-3">
          <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-[var(--site-violet-soft)] py-1.5 leading-none text-[var(--site-violet)]">
            <span className="text-[10px] font-semibold">{r.day}</span><span className="mt-1 text-[17px] font-bold">{r.date}</span>
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-semibold">{r.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{r.time}</span>
          </span>
          {r.join ? (
            <span className="rounded-full bg-[var(--site-violet)] px-3 py-1 text-[11px] font-semibold text-white">Join</span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Soon</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ProgressVignette({ wide }: { wide?: boolean }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const rows: { label: string; state: "done" | "review" | "todo" }[] = [
    { label: "Lesson 1 task", state: "done" },
    { label: "Lesson 2 task", state: "done" },
    { label: "Lesson 3 task", state: "review" },
    { label: "Lesson 4 task", state: "todo" },
  ];
  return (
    <div className="flex h-full items-center gap-5">
      <div className="relative size-[104px] shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--site-violet)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.32} />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none"><span className="text-[22px] font-bold">68%</span><span className="mt-1 text-[10px] text-muted-foreground">done</span></span>
      </div>
      <ul className="grid min-w-0 flex-1 gap-2">
        {rows.map((t) => (
          <li key={t.label} className="flex items-center gap-2 text-[12px]">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", t.state === "done" ? "bg-[var(--site-violet)] text-white" : t.state === "review" ? "bg-[var(--site-butter)] text-[var(--site-butter-ink)]" : "bg-muted")}>
              {t.state === "done" ? <Check className="size-3" /> : t.state === "review" ? <Clock3 className="size-3" /> : null}
            </span>
            <span className={cn("truncate", t.state === "todo" && "text-muted-foreground")}>{t.label}</span>
          </li>
        ))}
      </ul>
      {wide && <WeekChart />}
    </div>
  );
}

/** Minutes learned per day this week; today is the violet bar. */
function WeekChart() {
  const days = [
    { d: "M", v: 40 }, { d: "T", v: 65 }, { d: "W", v: 30 }, { d: "T", v: 85, today: true }, { d: "F", v: 0 }, { d: "S", v: 0 }, { d: "S", v: 0 },
  ];
  return (
    <div className="hidden h-full w-[46%] shrink-0 flex-col rounded-2xl border bg-card p-4 sm:flex">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">This week</span>
        <span className="text-[12px] text-muted-foreground"><b className="font-semibold text-foreground">3h 40m</b> learned</span>
      </div>
      <div className="mt-3 flex flex-1 items-end gap-2">
        {days.map((x, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cn("w-full max-w-7 rounded-md", x.today ? "bg-[var(--site-violet)]" : x.v ? "bg-[var(--site-violet-line)]" : "bg-muted")} style={{ height: `${Math.max(x.v, 8)}%` }} />
            <span className={cn("text-[10px]", x.today ? "font-semibold text-foreground" : "text-muted-foreground")}>{x.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A fixed 7×7 pattern that reads as a QR code.
const QR = "1110111100010110101011101110000000111010111011100111001010101110100011101011";

function CertificateVignette() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-[270px] -rotate-2 rounded-2xl border bg-card p-3 shadow-sm">
        <div className="rounded-xl border border-dashed border-[var(--site-violet-line)] p-3.5">
          <div className="text-[11px] font-semibold text-[var(--site-violet)]">Certificate of completion</div>
          <div className="mt-1 text-[16px] font-bold">Priya Nair</div>
          <div className="text-[11px] text-muted-foreground">Go Backend Mastery</div>
          <div className="mt-3 flex items-end justify-between">
            <span className="grid grid-cols-7 gap-[2px] rounded-md bg-white p-1 ring-1 ring-black/5" aria-hidden>
              {Array.from({ length: 49 }, (_, i) => <span key={i} className={cn("size-[5px] rounded-[1px]", QR[i] === "1" ? "bg-[#19171f]" : "bg-transparent")} />)}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-[var(--site-violet-soft)] py-1 pr-2.5 pl-1 text-[11px] font-semibold text-[var(--site-violet)]">
              <span className="flex size-5 items-center justify-center rounded-full bg-[var(--site-violet)] text-white"><Check className="size-3" /></span>Verified
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchVignette() {
  const batches = [
    { name: "Online, evenings", when: "Mon, Wed and Fri at 7 PM", taken: 18, seats: 25, icon: MonitorPlay },
    { name: "Classroom, weekends", when: "Sat and Sun at 10 AM", taken: 12, seats: 20, icon: MapPin },
  ];
  return (
    <div className="grid h-full content-center gap-3 sm:grid-cols-2">
      {batches.map((b) => (
        <div key={b.name} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--site-violet-soft)] text-[var(--site-violet)]"><b.icon className="size-4" /></span>
            <span className="text-[14px] font-semibold">{b.name}</span>
          </div>
          <div className="mt-2 text-[12px] text-muted-foreground">{b.when}</div>
          <div className="mt-3 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--site-violet)]" style={{ width: `${(b.taken / b.seats) * 100}%` }} /></div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">{b.taken} of {b.seats} seats taken</div>
        </div>
      ))}
    </div>
  );
}

const FALLBACK_ICONS: Record<string, typeof Sparkles> = { book: BookOpen, award: Award, video: Video, check: CheckCircle2 };

function IconVignette({ icon }: { icon: string }) {
  const Icon = FALLBACK_ICONS[icon] ?? Sparkles;
  return (
    <div className="flex h-full items-center justify-center">
      <span className="flex size-20 items-center justify-center rounded-[28px] bg-[var(--site-violet-soft)] text-[var(--site-violet)]"><Icon className="size-9" /></span>
    </div>
  );
}

/** The picture for a feature, by its CMS icon name. `wide` tiles have room for more detail. */
export function FeatureVignette({ icon, wide }: { icon: string; wide?: boolean }) {
  switch (icon) {
    case "play":
      return <VideoVignette wide={wide} />;
    case "check":
      return <ReviewVignette />;
    case "video":
      return <LiveVignette />;
    case "chart":
      return <ProgressVignette wide={wide} />;
    case "award":
      return <CertificateVignette />;
    case "users":
      return <BatchVignette />;
    default:
      return <IconVignette icon={icon} />;
  }
}
