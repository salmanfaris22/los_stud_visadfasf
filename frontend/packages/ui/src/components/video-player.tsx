"use client";
import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Embeds a YouTube / Vimeo / Bunny / Cloudflare player.
 * The iframe is not allowed to go fullscreen by itself; our button fullscreens the wrapper instead,
 * so the moving watermark (student name + email) stays on top even in fullscreen.
 */
export function VideoPlayer({ embedUrl, title, watermark, className }: { embedUrl: string; title: string; watermark?: string; className?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ top: 8, left: 6 });
  const [full, setFull] = React.useState(false);

  React.useEffect(() => {
    if (!watermark) return;
    const t = setInterval(() => setPos({ top: 6 + Math.random() * 78, left: 4 + Math.random() * 62 }), 6000);
    return () => clearInterval(t);
  }, [watermark]);

  React.useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };

  return (
    <div ref={box} className={cn("group relative aspect-video w-full overflow-hidden bg-black", full ? "rounded-none" : "rounded-[20px]", className)}>
      <iframe
        key={embedUrl}
        src={embedUrl}
        title={title}
        className="absolute inset-0 size-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {watermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 select-none rounded px-2 py-1 text-[11px] font-medium text-white/40 mix-blend-difference transition-all duration-[2500ms] ease-in-out sm:text-xs"
          style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
        >
          {watermark}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={full ? "Exit fullscreen" : "Fullscreen"}
        className="absolute right-3 bottom-14 z-20 rounded-full bg-black/60 p-2 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100"
      >
        {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  );
}
