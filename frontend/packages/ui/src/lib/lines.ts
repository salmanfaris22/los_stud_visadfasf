/*
 * Course line colours. Plain functions (no "use client"), so server components can call them too.
 * Every course is a line; its colour comes from a hash of its id, so it is the same on every page.
 */

export const LINES = 8;
/** Text colour that reads best on each line colour (red, blue, green, orange, purple, teal, pink, sky). */
export const LINE_TEXT = ["#ffffff", "#ffffff", "#15171e", "#15171e", "#ffffff", "#15171e", "#ffffff", "#15171e"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0…7 — the same course id always gets the same line. */
export function lineIndex(key?: string | null) {
  return hash(key || "-") % LINES;
}

/** CSS colour of a course line, e.g. `var(--line-3)`. */
export function lineColor(key?: string | null) {
  return `var(--line-${lineIndex(key) + 1})`;
}

/** Readable text colour on top of the course line colour. */
export function lineTextColor(key?: string | null) {
  return LINE_TEXT[lineIndex(key)]!;
}

/** "Go Backend Mastery" → "GB", "Next.js Frontend Bootcamp" → "NF". */
export function lineCode(title?: string | null) {
  const words = (title ?? "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "•";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
