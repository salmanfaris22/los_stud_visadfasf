import { Code, ConnectError } from "@connectrpc/connect";

/** Turns a gRPC error or a thrown error into a short message for toasts and forms. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof ConnectError) return err.rawMessage || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** The gRPC code of an error (Code.NotFound, Code.PermissionDenied…), if any. */
export function errorCode(err: unknown): Code | undefined {
  return err instanceof ConnectError ? err.code : undefined;
}
