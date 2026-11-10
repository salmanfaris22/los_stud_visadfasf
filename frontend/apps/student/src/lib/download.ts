"use client";
import { errorMessage, saveFile, type File } from "@lms/api-client";
import { toast } from "@lms/ui";

/** Downloads a file RPC (certificate PDF, .ics) with the student session. */
export async function download(get: () => Promise<{ file?: File }>, fallbackName: string) {
  try {
    saveFile((await get()).file, fallbackName);
  } catch (e) {
    toast.error(errorMessage(e, "Download failed"));
  }
}
