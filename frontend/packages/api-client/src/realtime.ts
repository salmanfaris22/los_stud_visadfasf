"use client";
import { useEffect, useRef } from "react";
import { createClient } from "@connectrpc/connect";
import type { JsonValue } from "@bufbuild/protobuf";
import type { Api } from "./client";
import { NotificationService } from "./gen/lms/v1/notifications_pb";

export type RealtimeEvent = { type: string; data: JsonValue | undefined };

/**
 * Keeps the realtime stream (NotificationService.Subscribe) open while `enabled` is true and calls
 * `onEvent` for every server event ("ping" heartbeats are skipped). Reconnects with backoff (1s → 30s).
 */
export function useRealtime(api: Api, enabled: boolean, onEvent: (e: RealtimeEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const client = createClient(NotificationService, api.transport);
    const abort = new AbortController();
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      try {
        for await (const ev of client.subscribe({}, { signal: abort.signal })) {
          delay = 1000;
          if (ev.type !== "ping") handler.current({ type: ev.type, data: ev.data });
        }
      } catch {
        /* closed or failed: retry below */
      }
      if (abort.signal.aborted) return;
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    };
    void connect();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, enabled]);
}
