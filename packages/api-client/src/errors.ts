type Problem = { title?: string; detail?: string; status?: number; errors?: { message?: string; location?: string }[] };

function field(location?: string) {
  if (!location) return "";
  const name = location.replace(/^body\./, "").replace(/\[\d+\]/g, "").split(".").pop() ?? "";
  return name ? `${name.replace(/_/g, " ")}: ` : "";
}

/** Turns an API problem (RFC 9457) or thrown error into a short message for toasts and forms. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  const p = err as Problem;
  const first = p.errors?.[0];
  if (first?.message) return `${field(first.location)}${first.message}`;
  if (p.detail) return p.detail;
  if (err instanceof Error && err.message) return err.message;
  return p.title || fallback;
}

/** HTTP status of an API problem, if any. */
export function errorStatus(err: unknown): number | undefined {
  return (err as Problem | undefined)?.status;
}
