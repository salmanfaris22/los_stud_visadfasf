"use client";
import { useEffect, useRef } from "react";
import type { Api } from "./client";

export type RealtimeEvent = { type: string; data: unknown };

/**
 * Keeps a WebSocket open while `enabled` is true and calls `onEvent` for every server event.
 * Reconnects with backoff (1s → 30s). Each connection uses a fresh one-time ticket.
 */
export function useRealtime(api: Api, enabled: boolean, onEvent: (e: RealtimeEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      const { data } = await api.client.POST("/api/v1/ws/ticket").catch(() => ({ data: undefined }));
      if (stopped) return;
      if (!data) return retry();
      ws = new WebSocket(data.url);
      ws.onopen = () => (delay = 1000);
      ws.onmessage = (m) => {
        try {
          handler.current(JSON.parse(m.data as string) as RealtimeEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => !stopped && retry();
    };
    const retry = () => {
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    };
    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [api, enabled]);
}
