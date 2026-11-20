/**
 * Certificate field layout, the same rules as the API's PDF renderer (backend/internal/service/certificate_render.go):
 * placeholders are filled, **bold** words switch font, lines wrap at the box width (or shrink to fit one line),
 * line i sits on baseline y + ascent·size + i·lineHeight·size, letter spacing goes between characters, no kerning.
 * Units: millimetres on an A4 landscape page; font sizes in points.
 */
import type { CertificateField, Draft } from "@lms/api-client";

export type Field = Draft<CertificateField>;
export const PAGE_W = 297;
export const PAGE_H = 210;
export const PT_MM = 25.4 / 72;

export type FontKey = "sans-light" | "sans" | "sans-medium" | "sans-semibold" | "sans-bold" | "sans-extrabold" | "script";

export const FONTS: Record<FontKey, { label: string; family: string; weight: number; ascent: number; descent: number; file: string }> = {
  "sans-light": { label: "Poppins Light", family: "Cert Poppins", weight: 300, ascent: 1.05, descent: 0.35, file: "Poppins-Light.ttf" },
  sans: { label: "Poppins Regular", family: "Cert Poppins", weight: 400, ascent: 1.05, descent: 0.35, file: "Poppins-Regular.ttf" },
  "sans-medium": { label: "Poppins Medium", family: "Cert Poppins", weight: 500, ascent: 1.05, descent: 0.35, file: "Poppins-Medium.ttf" },
  "sans-semibold": { label: "Poppins SemiBold", family: "Cert Poppins", weight: 600, ascent: 1.05, descent: 0.35, file: "Poppins-SemiBold.ttf" },
  "sans-bold": { label: "Poppins Bold", family: "Cert Poppins", weight: 700, ascent: 1.05, descent: 0.35, file: "Poppins-Bold.ttf" },
  "sans-extrabold": { label: "Poppins ExtraBold", family: "Cert Poppins", weight: 800, ascent: 1.05, descent: 0.35, file: "Poppins-ExtraBold.ttf" },
  script: { label: "Great Vibes (script)", family: "Cert Great Vibes", weight: 400, ascent: 0.851, descent: 0.401, file: "GreatVibes-Regular.ttf" },
};

export const fontKey = (k?: string): FontKey => (k && k in FONTS ? (k as FontKey) : "sans");

/** The font **bold** words use, written in font k. */
export function boldOf(k: FontKey): FontKey {
  if (k === "sans-light" || k === "sans" || k === "sans-medium") return "sans-semibold";
  if (k === "sans-semibold" || k === "sans-bold") return "sans-extrabold";
  return k;
}

/** Loads the certificate fonts into the page once (FontFace API); resolves when they can be measured. */
let fontsReady: Promise<void> | null = null;
export function loadCertificateFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  fontsReady ??= Promise.all(
    Object.values(FONTS).map(async (f) => {
      const face = new FontFace(f.family, `url(/fonts/certificate/${f.file})`, { weight: String(f.weight) });
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return fontsReady;
}

export type Values = { student: string; course: string; courseText: string; year: string; date: string; code: string; verifyUrl: string };

export const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{student}", label: "Student name" },
  { token: "{course}", label: "Course" },
  { token: "{course_text}", label: "Course sentence" },
  { token: "{year}", label: "Year" },
  { token: "{date}", label: "Date" },
  { token: "{code}", label: "Certificate ID" },
  { token: "{verify_url}", label: "Verify link" },
];

export function sampleValues(course?: { title: string; certificateText?: string }): Values {
  const now = new Date();
  return {
    student: "Fathima Risana",
    course: course?.title || "AI Video Production",
    courseText: course
      ? (course.certificateText ?? "")
      : "The course covered AI-assisted scriptwriting, AI image and video generation, AI voiceovers, and editing workflows for creating professional video content.",
    year: String(now.getFullYear()),
    date: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    code: "MS-SAMPLE01",
    verifyUrl: "https://example.com/verify/MS-SAMPLE01",
  };
}

/** Fills placeholders and tidies the spaces left by empty values (like CertValues.Fill). */
export function fill(text: string, v: Values): string {
  const out = text
    .replaceAll("{student}", v.student)
    .replaceAll("{course}", v.course)
    .replaceAll("{course_text}", v.courseText)
    .replaceAll("{year}", v.year)
    .replaceAll("{date}", v.date)
    .replaceAll("{code}", v.code)
    .replaceAll("{verify_url}", v.verifyUrl);
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n");
}

export type Seg = { text: string; font: FontKey };

export function boldRuns(text: string, font: FontKey): Seg[] {
  return text
    .split("**")
    .map((part, i) => ({ text: part, font: i % 2 === 1 ? boldOf(font) : font }))
    .filter((s) => s.text !== "");
}

const plain = (line: Seg[]) => line.map((s) => s.text).join("");

/** Breaks runs into lines no wider than max, at spaces (like wrapLine in Go). */
export function wrapLine(runs: Seg[], max: number, width: (l: Seg[]) => number): Seg[][] {
  const words: Seg[][] = [];
  let cur: Seg[] = [];
  for (const r of runs) {
    r.text.split(" ").forEach((w, j) => {
      if (j > 0) {
        words.push(cur);
        cur = [];
      }
      if (w !== "") cur.push({ text: w, font: r.font });
    });
  }
  words.push(cur);
  const lines: Seg[][] = [];
  let line: Seg[] = [];
  for (const w of words) {
    if (w.length === 0) continue;
    const next = line.length > 0 ? [...line, { text: " ", font: w[0]!.font }, ...w] : [...w];
    if (line.length > 0 && width(next) > max) {
      lines.push(line);
      line = [...w];
      continue;
    }
    line = next;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Text width in mm for a font at a size (pt), measured without kerning like the PDF. */
let ctx: CanvasRenderingContext2D | null = null;
const MEASURE_SCALE = 20; // measure at 20 px per mm for precision
export function textWidth(text: string, font: FontKey, sizePt: number): number {
  if (typeof document === "undefined") return text.length * sizePt * PT_MM * 0.5;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  const f = FONTS[font];
  ctx.font = `${f.weight} ${sizePt * PT_MM * MEASURE_SCALE}px "${f.family}"`;
  (ctx as CanvasRenderingContext2D & { fontKerning: string }).fontKerning = "none";
  return ctx.measureText(text).width / MEASURE_SCALE;
}

export type LaidLine = { segs: Seg[]; x: number; baseline: number };
export type Layout = { lines: LaidLine[]; size: number; font: FontKey; height: number };

/** Lays out a text field: lines with their start x and baseline, the (maybe shrunk) font size and the box height. */
export function layoutText(f: Field, v: Values): Layout {
  const font = fontKey(f.font);
  let size = f.size && f.size > 0 ? f.size : 12;
  const lh = f.lineHeight && f.lineHeight > 0 ? f.lineHeight : 1.2;
  const spacing = f.spacing ?? 0;
  let text = fill(f.text ?? "", v);
  if (f.uppercase) text = text.toUpperCase();
  const lineWidth = (line: Seg[], sz: number) => {
    const n = [...plain(line)].length;
    return line.reduce((w, s) => w + textWidth(s.text, s.font, sz), 0) + (n > 1 ? spacing * (n - 1) : 0);
  };
  let lines: Seg[][] = [];
  if (text.trim() !== "") {
    if (f.fit) {
      lines = [boldRuns(text.replaceAll("\n", " "), font)];
      const w = lineWidth(lines[0]!, size);
      if (w > f.w && w > 0) {
        const n = [...plain(lines[0]!)].length - 1;
        const glyphs = w - spacing * n;
        const room = f.w - spacing * n;
        if (glyphs > 0 && room > 0) size *= room / glyphs;
      }
    } else {
      for (const para of text.split("\n")) lines.push(...wrapLine(boldRuns(para, font), f.w, (l) => lineWidth(l, size)));
    }
  }
  const sizeMM = size * PT_MM;
  const asc = FONTS[font].ascent;
  const laid = lines.map((segs, i) => {
    const w = lineWidth(segs, size);
    const x = f.align === "center" ? f.x + (f.w - w) / 2 : f.align === "right" ? f.x + f.w - w : f.x;
    return { segs, x, baseline: f.y + asc * sizeMM + i * lh * sizeMM };
  });
  const rows = Math.max(1, laid.length);
  const height = (rows - 1) * lh * sizeMM + (asc + FONTS[font].descent) * sizeMM;
  return { lines: laid, size, font, height };
}

let seq = 0;
export const newFieldId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Starting points for "Add field". */
export function presetField(kind: "student" | "course" | "description" | "year" | "date" | "code" | "qr" | "image" | "text"): Field {
  const base = { id: newFieldId(kind), x: 30, y: 90, w: 140, font: "sans", size: 14, color: "#ffffff", align: "left", spacing: 0, lineHeight: 1.2, uppercase: false, fit: false, src: "", text: "", label: "" };
  switch (kind) {
    case "student":
      return { ...base, kind: "text", label: "Student name", text: "{student}", font: "script", size: 48, color: "#e3c06c", fit: true };
    case "course":
      return { ...base, kind: "text", label: "Course", text: "{course}", font: "sans-bold", size: 18, fit: true };
    case "description":
      return { ...base, kind: "text", label: "Description", text: "For successfully completing the **{course}** course. {course_text}", size: 11, lineHeight: 1.6 };
    case "year":
      return { ...base, kind: "text", label: "Year", text: "{year}", font: "sans-bold", size: 18, w: 30, align: "center", fit: true };
    case "date":
      return { ...base, kind: "text", label: "Date", text: "Issued on {date}", size: 10, w: 80 };
    case "code":
      return { ...base, kind: "text", label: "Certificate ID", text: "Certificate ID: {code}", font: "sans-semibold", size: 9, w: 80 };
    case "qr":
      return { ...base, kind: "qr", label: "QR code", w: 16, color: "#0d1e53" };
    case "image":
      return { ...base, kind: "image", label: "Image", w: 50 };
    default:
      return { ...base, kind: "text", label: "Text", text: "Your text" };
  }
}
