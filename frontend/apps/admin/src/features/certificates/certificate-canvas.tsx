"use client";
import * as React from "react";
import { cn } from "@lms/ui";

import { FONTS, PAGE_H, PAGE_W, PT_MM, layoutText, loadCertificateFonts, type Field, type Values } from "./layout";

/** Natural aspect (height / width) of image fields, loaded once per URL. */
function useImageAspects(srcs: string[]) {
  const [aspects, setAspects] = React.useState<Record<string, number>>({});
  const key = srcs.join("|");
  React.useEffect(() => {
    for (const src of srcs) {
      if (!src || aspects[src]) continue;
      const img = new Image();
      img.onload = () => setAspects((a) => ({ ...a, [src]: img.naturalHeight / Math.max(1, img.naturalWidth) }));
      img.src = src;
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return aspects;
}

/** Re-renders once the certificate fonts are loaded so text is measured with the real fonts. */
function useFontsReady() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    void loadCertificateFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** A small stand-in for the QR code (the real one, for the verify link, is drawn in the PDF). */
function QrMark({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const m = size / 25;
  const finder = (fx: number, fy: number) => (
    <g key={`${fx}-${fy}`}>
      <rect x={x + fx * m} y={y + fy * m} width={7 * m} height={7 * m} fill={color} />
      <rect x={x + (fx + 1) * m} y={y + (fy + 1) * m} width={5 * m} height={5 * m} fill="#fff" />
      <rect x={x + (fx + 2) * m} y={y + (fy + 2) * m} width={3 * m} height={3 * m} fill={color} />
    </g>
  );
  const dots = [[10, 3], [12, 5], [9, 8], [14, 9], [11, 11], [16, 12], [9, 14], [13, 15], [18, 16], [10, 18], [15, 19], [19, 20], [12, 21], [17, 10], [20, 13]];
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill="#fff" />
      {finder(2, 2)}
      {finder(16, 2)}
      {finder(2, 16)}
      {dots.map(([dx, dy]) => <rect key={`${dx}-${dy}`} x={x + dx! * m} y={y + dy! * m} width={2 * m} height={2 * m} fill={color} />)}
    </g>
  );
}

export type CanvasProps = {
  background?: string;
  fields: Field[];
  values: Values;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, patch: Partial<Field>) => void;
  className?: string;
};

/** Draws a certificate template in millimetres (A4 landscape). Editable when onMove is given. */
export function CertificateCanvas({ background, fields, values, selected, onSelect, onMove, className }: CanvasProps) {
  useFontsReady();
  const svg = React.useRef<SVGSVGElement>(null);
  const aspects = useImageAspects(fields.filter((f) => f.kind === "image" && f.src).map((f) => f.src!));
  const drag = React.useRef<{ id: string; mode: "move" | "resize"; start: { x: number; y: number }; orig: Field } | null>(null);
  const editable = !!onMove;

  const toMM = (e: React.PointerEvent) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const snap = (v: number) => Math.round(v * 4) / 4; // 0.25 mm steps

  const down = (e: React.PointerEvent, f: Field, mode: "move" | "resize") => {
    if (!editable) return;
    e.stopPropagation();
    onSelect?.(f.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, start: toMM(e), orig: f };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onMove) return;
    const p = toMM(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (d.mode === "move") onMove(d.id, { x: snap(d.orig.x + dx), y: snap(d.orig.y + dy) });
    else onMove(d.id, { w: Math.max(2, snap(d.orig.w + dx)) });
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      className={cn("block h-auto w-full select-none", editable && "touch-none", className)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerDown={() => onSelect?.(null)}
      // Plain glyphs like the PDF: no kerning, ligatures, contextual or stylistic alternates (the app font turns on ss01).
      style={{ fontKerning: "none", fontVariantLigatures: "none", fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0' }}
      role="img"
      aria-label="Certificate preview"
    >
      <rect width={PAGE_W} height={PAGE_H} fill="#e5e7eb" />
      {background && <image href={background} x={0} y={0} width={PAGE_W} height={PAGE_H} preserveAspectRatio="none" />}
      {fields.map((f) => {
        let box = { x: f.x, y: f.y, w: f.w, h: 6 };
        let body: React.ReactNode = null;
        if (f.kind === "qr") {
          box = { x: f.x, y: f.y, w: f.w, h: f.w };
          body = <QrMark x={f.x} y={f.y} size={f.w} color={f.color || "#0d1e53"} />;
        } else if (f.kind === "image") {
          const h = f.w * (aspects[f.src ?? ""] ?? 0.4);
          box = { x: f.x, y: f.y, w: f.w, h };
          body = f.src ? <image href={f.src} x={f.x} y={f.y} width={f.w} height={h} preserveAspectRatio="xMinYMin meet" /> : null;
        } else {
          const l = layoutText(f, values);
          const font = FONTS[l.font];
          box = { x: f.x, y: f.y, w: f.w, h: Math.max(2, l.height) };
          body = l.lines.map((line, i) => (
            <text
              key={i}
              x={line.x}
              y={line.baseline}
              fontSize={l.size * PT_MM}
              fill={f.color || "#000000"}
              fontFamily={`"${font.family}"`}
              fontWeight={font.weight}
              letterSpacing={f.spacing || 0}
              style={{ whiteSpace: "pre" }}
            >
              {line.segs.map((s, j) => (
                <tspan key={j} fontFamily={`"${FONTS[s.font].family}"`} fontWeight={FONTS[s.font].weight}>
                  {s.text}
                </tspan>
              ))}
            </text>
          ));
        }
        const isSel = selected === f.id;
        return (
          <g key={f.id}>
            {body}
            {editable && (
              <>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="transparent"
                  stroke={isSel ? "#38bdf8" : "transparent"}
                  strokeWidth={0.35}
                  strokeDasharray={isSel ? "1.2 0.8" : undefined}
                  className={cn("cursor-move", !isSel && "hover:stroke-sky-300/70")}
                  onPointerDown={(e) => down(e, f, "move")}
                />
                {isSel && (
                  <rect x={box.x + box.w - 1} y={box.y + box.h / 2 - 2} width={2} height={4} rx={0.5} fill="#38bdf8" className="cursor-ew-resize" onPointerDown={(e) => down(e, f, "resize")} />
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
