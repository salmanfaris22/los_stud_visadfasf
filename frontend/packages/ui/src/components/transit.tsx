"use client";
import * as React from "react";
import { cn } from "../lib/utils";
import { LINE_TEXT, lineCode, lineIndex } from "../lib/lines";

/*
 * Transit pieces: every course is a line with its own colour and badge,
 * lessons are stops and the certificate is the last stop.
 */

const badgeSizes = {
  xs: "size-5 text-[8.5px]",
  sm: "size-6 text-[9.5px]",
  md: "size-8 text-[11px]",
  lg: "size-11 text-sm",
  xl: "size-14 text-base",
};

/** Round line badge with the course initials, like a metro line bullet. */
export function LineBadge({ id, name, size = "md", className, title }: { id?: string | null; name?: string | null; size?: keyof typeof badgeSizes; className?: string; title?: string }) {
  const i = lineIndex(id ?? name);
  return (
    <span
      aria-hidden={!title}
      title={title}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-extrabold tracking-[-0.02em] tabular-nums shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.22)]", badgeSizes[size], className)}
      style={{ background: `var(--line-${i + 1})`, color: LINE_TEXT[i] }}
    >
      {lineCode(name)}
    </span>
  );
}

export type StopState = "done" | "current" | "next";

const dotSizes = { sm: 10, md: 14, lg: 18 } as const;
const trackSizes = { sm: 4, md: 6, lg: 8 } as const;

/** One station marker. */
export function Stop({ state, color, size = "md", terminus, className, style }: { state: StopState; color: string; size?: keyof typeof dotSizes; terminus?: boolean; className?: string; style?: React.CSSProperties }) {
  const d = dotSizes[size] + (terminus ? 4 : 0);
  const ring = Math.max(2, Math.round(dotSizes[size] / 4.5));
  const base: React.CSSProperties = { width: d, height: d, borderWidth: ring, ...style };
  if (terminus) {
    // Interchange-style double ring; yellow once reached.
    return (
      <span
        className={cn("block shrink-0 rounded-full border-foreground", state === "done" ? "bg-signal" : "bg-card", state === "current" && "animate-here", className)}
        style={{ ...base, boxShadow: `0 0 0 ${ring}px var(--card), 0 0 0 ${ring * 2}px var(--foreground)` }}
      />
    );
  }
  if (state === "current") {
    return <span className={cn("block shrink-0 animate-here rounded-full border-foreground bg-signal", className)} style={base} />;
  }
  return (
    <span
      className={cn("block shrink-0 rounded-full bg-card", className)}
      style={{ ...base, borderColor: state === "done" ? color : "var(--track)" }}
    />
  );
}

type TrackStop = { label?: string; done?: boolean };

/**
 * A course drawn as a line. `progress` (0–100) fills the line; stops are lessons.
 * Pass `stops` as a number (evenly spaced, filled by progress) or as a list with real done flags.
 */
export function LineTrack({
  color, stops, progress, terminus = true, terminusLabel = "Certificate", labels, size = "md", animate = true, className,
}: {
  color: string;
  stops: number | TrackStop[];
  progress?: number;
  terminus?: boolean;
  terminusLabel?: string;
  labels?: boolean;
  size?: keyof typeof dotSizes;
  animate?: boolean;
  className?: string;
}) {
  const list: TrackStop[] = typeof stops === "number" ? Array.from({ length: Math.max(0, Math.min(stops, 40)) }, () => ({})) : stops;
  const points = list.length + (terminus ? 1 : 0);
  const pos = (i: number) => (points <= 1 ? 0 : (i / (points - 1)) * 100);
  const doneFlags = typeof stops === "number" ? null : list.map((s) => !!s.done);
  const target = Math.max(0, Math.min(100, progress ?? (doneFlags ? (doneFlags.filter(Boolean).length / Math.max(1, list.length)) * 100 : 0)));
  const [fill, setFill] = React.useState(animate ? 0 : target);
  React.useEffect(() => {
    if (!animate) return setFill(target);
    const t = requestAnimationFrame(() => setFill(target));
    return () => cancelAnimationFrame(t);
  }, [target, animate]);

  const isDone = (i: number) => (doneFlags ? doneFlags[i]! : pos(i) <= target + 0.01 && target > 0);
  const firstOpen = list.findIndex((_, i) => !isDone(i));
  const finished = target >= 100 || (list.length > 0 && firstOpen === -1);
  const dot = dotSizes[size] + 4;
  const thick = trackSizes[size];
  const showLabels = labels && points <= 9;

  return (
    <div className={cn("relative w-full", className)} role="img" aria-label={`${Math.round(target)}% complete`}>
      <div className="relative" style={{ height: dot + 8, marginInline: dot / 2 + 3 }}>
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-track" style={{ height: thick }} />
        <span
          className="absolute top-1/2 left-0 -translate-y-1/2 rounded-full transition-[width] duration-[1200ms] ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ width: `${fill}%`, height: thick, background: color }}
        />
        {list.map((s, i) => (
          <Stop
            key={i}
            size={size}
            color={color}
            state={isDone(i) ? "done" : i === firstOpen ? "current" : "next"}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos(i)}%` }}
          />
        ))}
        {terminus && (
          <Stop
            terminus
            size={size}
            color={color}
            state={finished ? "done" : list.length === 0 ? "current" : "next"}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "100%" }}
          />
        )}
      </div>
      {showLabels && (
        <div className="relative mt-1.5 h-9 text-[11px] leading-tight text-muted-foreground" style={{ marginInline: dot / 2 + 3 }}>
          {[...list.map((s) => s.label ?? ""), ...(terminus ? [terminusLabel] : [])].map((l, i) => {
            const edge = i === 0 ? "translate-x-0 text-left" : i === points - 1 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center";
            return (
              <span key={i} className={cn("absolute top-0 line-clamp-2 w-[11ch]", edge, i === points - 1 && terminus && "font-semibold text-foreground")} style={{ left: `${pos(i)}%` }}>
                {l}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Left gutter of a vertical route list (playlists, curricula, steps).
 * `trail` colours the segment above the stop, `ahead` the segment below it.
 */
export function RouteGutter({ color, state, first, last, trail, ahead, size = "md", terminus, className }: {
  color: string; state: StopState; first?: boolean; last?: boolean; trail?: boolean; ahead?: boolean; size?: keyof typeof dotSizes; terminus?: boolean; className?: string;
}) {
  const w = trackSizes[size];
  return (
    <span aria-hidden className={cn("relative flex w-7 shrink-0 items-center justify-center self-stretch", className)}>
      {!first && <span className="absolute top-0 left-1/2 h-1/2 -translate-x-1/2" style={{ width: w, background: trail ? color : "var(--track)" }} />}
      {!last && <span className="absolute bottom-0 left-1/2 h-1/2 -translate-x-1/2" style={{ width: w, background: ahead ? color : "var(--track)" }} />}
      <Stop state={state} color={color} size={size} terminus={terminus} className="relative z-10" />
    </span>
  );
}

type Pt = [number, number];
const NETWORK: { line: number; pts: Pt[] }[] = [
  { line: 1, pts: [[-20, 140], [180, 140], [300, 260], [620, 260]] },
  { line: 2, pts: [[160, -20], [160, 120], [300, 260], [300, 620]] },
  { line: 3, pts: [[-20, 520], [120, 520], [260, 380], [340, 380], [460, 260], [460, -20]] },
  { line: 5, pts: [[-20, 300], [80, 300], [220, 440], [620, 440]] },
  { line: 4, pts: [[620, 360], [520, 360], [400, 480], [400, 620]] },
];
const STATIONS: Pt[] = [[80, 140], [540, 260], [160, 60], [300, 350], [300, 540], [40, 520], [190, 450], [460, 120], [20, 300], [150, 370], [540, 440], [580, 360], [400, 560]];
const INTERCHANGES: Pt[] = [[300, 260], [300, 440], [460, 260], [440, 440]];
const HERE: Pt = [240, 200];

/** Decorative network map that draws itself once (auth panels, empty pages). */
export function TransitArt({ className, here = true }: { className?: string; here?: boolean }) {
  const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <svg viewBox="0 0 600 600" className={cn("block", className)} aria-hidden fill="none">
      {NETWORK.map((n, i) => (
        <path
          key={i}
          d={path(n.pts)}
          pathLength={1}
          stroke={`var(--line-${n.line})`}
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1"
          className="animate-draw"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
      <g className="animate-fade-in" style={{ animationDelay: "900ms", animationDuration: "500ms", animationFillMode: "both" }}>
        {STATIONS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} fill="var(--card)" stroke="var(--foreground)" strokeWidth={3.5} />)}
        {INTERCHANGES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={12} fill="var(--card)" stroke="var(--foreground)" strokeWidth={4.5} />)}
        {here && (
          <>
            <circle cx={HERE[0]} cy={HERE[1]} r={22} fill="var(--signal)" className="here-pulse" />
            <circle cx={HERE[0]} cy={HERE[1]} r={11} fill="var(--signal)" stroke="var(--foreground)" strokeWidth={4.5} />
          </>
        )}
      </g>
    </svg>
  );
}

/** Brand mark: the "you are here" stop. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground", className)}>
      <span className="size-[42%] rounded-full bg-signal shadow-[0_0_0_2.5px_var(--foreground)]" />
    </span>
  );
}
