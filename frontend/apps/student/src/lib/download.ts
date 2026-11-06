"use client";
import { toast } from "@lms/ui";

/** Downloads a protected file (PDF / ICS) with the student session. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(path, { credentials: "include", headers: { "X-LMS-App": "student" } });
  if (!res.ok) {
    toast.error("Download failed");
    return;
  }
  const blob = await res.blob();
  const name = /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
