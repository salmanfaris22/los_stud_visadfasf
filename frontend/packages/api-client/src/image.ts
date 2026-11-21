// Image links sized for where they are shown. Uploaded images (/api/v1/files/<id>) are served by
// the API as compressed copies at a few fixed widths (128, 320, 640, 1280, 1920), cached for a year,
// so a card asks for a small one and a page header for a big one. Other links are left as they are.

const FILES = "/api/v1/files/";

/** imageUrl("/api/v1/files/<id>", 640) -> "/api/v1/files/<id>?w=640". */
export function imageUrl(url: string | undefined | null, width: number): string {
  if (!url) return "";
  if (!url.startsWith(FILES) && !url.includes(FILES)) return url;
  const [path, query = ""] = url.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("w", String(Math.round(width)));
  return `${path}?${params.toString()}`;
}
