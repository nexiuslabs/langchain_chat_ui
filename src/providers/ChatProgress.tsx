"use client";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStreamContext } from "@/providers/Stream";
import { logEvent } from "@/lib/troubleshoot-logger";
import { useAuthFetch } from "@/lib/useAuthFetch";

type ProgressEvent = {
  id: string;
  label: string;
  message?: string;
  data?: any;
  ts: number;
};

type ChatProgressContextType = {
  events: ProgressEvent[];
  clear: () => void;
};

const ChatProgressContext = createContext<ChatProgressContextType | undefined>(undefined);

function buildStreamUrl(sessionId: string) {
  const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
  const base = useProxy ? "/api/backend" : (process.env.NEXT_PUBLIC_API_URL || "");
  const u = `${base}/chat/stream/${encodeURIComponent(sessionId)}?t=${Date.now()}`;
  return u;
}

export function ChatProgressProvider({ children }: { children: React.ReactNode }) {
  const stream = useStreamContext();
  const sessionId = (stream as any)?.threadId as string | null;
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const seenSynthetic = useRef<Set<string>>(new Set());
  const statusHistorySeen = useRef<Set<string>>(new Set());
  const authFetch = useAuthFetch();
  useEffect(() => {
    statusHistorySeen.current.clear();
    seenSynthetic.current.clear();
  }, [sessionId]);

  const clear = () => {
    setEvents([]);
    seenSynthetic.current.clear();
    statusHistorySeen.current.clear();
  };

  // Stable handlers
  const push = (label: string, payload: any) => {
    try {
      const data = typeof payload === "string" ? (() => { try { return JSON.parse(payload); } catch (_err) { return { message: String(payload) }; } })() : payload;
      const msg = typeof data?.message === "string" ? data.message : undefined;
      setEvents((prev) => {
        const next = [
          ...prev,
          {
            id: `${label}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
            label,
            message: msg,
            data,
            ts: Date.now(),
          },
        ];
        // keep last 200
        return next.slice(-200);
      });
    } catch (_err) {
      setEvents((prev) =>
        [...prev, { id: `${label}:${Date.now()}`, label, message: String(payload), ts: Date.now() }].slice(-200),
      );
    }
  };

  const pushStatusHistory = (history: any) => {
    const rows = Array.isArray(history) ? history : [];
    if (!rows.length) return;
    const additions: ProgressEvent[] = [];
    for (const row of rows) {
      if (!row) continue;
      const phase = typeof row.phase === "string" ? row.phase : "status";
      const message = typeof row.message === "string" ? row.message : undefined;
      const stamp = typeof row.timestamp === "string" ? row.timestamp : `${Date.now()}`;
      const key = `${phase}:${message || ""}:${stamp}`;
      if (statusHistorySeen.current.has(key)) continue;
      statusHistorySeen.current.add(key);
      additions.push({
        id: `status:${key}`,
        label: `status:${phase}`,
        message: message || phase,
        data: row,
        ts: Date.now(),
      });
    }
    if (!additions.length) return;
    setEvents((prev) => [...prev, ...additions].slice(-200));
  };

  useEffect(() => {
    // Start/stop EventSource on session change
    if (!sessionId) {
      if (esRef.current) {
        try { esRef.current.close(); } catch (_err) { void 0; }
        esRef.current = null;
      }
      return;
    }
    const url = buildStreamUrl(sessionId);
    const sanitizedUrl = url.split("?")[0];
    try {
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;
      // Generic message
      es.addEventListener("message", (e) => push("message", (e as MessageEvent).data));
      // ICP events
      [
        "icp:intake_saved",
        "icp:confirm_pending",
        "icp:planning_start",
        "icp:toplikes_ready",
        "icp:profile_ready",
        "icp:progress_summary",
        "icp:candidates_found",
      ].forEach((label) => es.addEventListener(label, (e) => push(label, (e as MessageEvent).data)));
      // Enrichment events
      [
        "enrich:start_top10",
        "enrich:company_tick",
        "enrich:summary",
      ].forEach((label) => es.addEventListener(label, (e) => push(label, (e as MessageEvent).data)));
      es.onerror = () => {
        logEvent({
          level: "warn",
          message: "SSE connection error",
          component: "ChatProgress.EventSource",
          route: sanitizedUrl,
          data: { session_id: sessionId },
        });
      };
    } catch (err: any) {
      logEvent({
        level: "error",
        message: err?.message || "Failed to initialise SSE stream",
        component: "ChatProgress.EventSource",
        route: sessionId ? buildStreamUrl(sessionId).split("?")[0] : undefined,
        error: {
          type: err?.name || "EventSourceInitError",
          message: err?.message || String(err),
          stack: String(err?.stack || "").split("\n").slice(0, 6),
        },
      });
    }
    return () => {
      try { esRef.current?.close(); } catch (_err) { void 0; }
      esRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    const base =
      (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "")) ||
      (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, ""));
    if (!sessionId || !base) return;
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;
    const intervalMs = (() => {
      const raw = process.env.NEXT_PUBLIC_ORCH_POLL_MS;
      const parsed = raw ? Number(raw) : NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) return 4000;
      return parsed;
    })();
    const poll = async () => {
      try {
        const url = `${base}/api/orchestrations/${encodeURIComponent(sessionId)}`;
        const res = await authFetch(url);
        if (res.ok) {
          const body = await res.json().catch(() => null);
          if (body?.status_history) pushStatusHistory(body.status_history);
        } else if (res.status === 404) {
          // Thread missing/stale — surface a clear status event in the UI
          pushStatusHistory([
            {
              phase: "expired_thread",
              message: "Thread expired or missing. Start a new chat.",
              timestamp: new Date().toISOString(),
            },
          ]);
        } else {
          logEvent({
            level: "warn",
            message: "Orchestrator status poll failed",
            component: "ChatProgress.poll",
            route: "/api/orchestrations/:thread_id",
            http: { status: res.status },
          });
        }
      } catch (err: any) {
        logEvent({
          level: "error",
          message: err?.message || "Orchestrator status poll error",
          component: "ChatProgress.poll",
          error: {
            type: err?.name || "StatusPollError",
            message: err?.message || String(err),
            stack: String(err?.stack || "").split("\n").slice(0, 6),
          },
        });
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, intervalMs);
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, authFetch]);

  // Synthesize progress from AI messages when backend SSE is not available in graph runs
  useEffect(() => {
    try {
      const msgs = stream.messages || [];
      if (!msgs.length) return;
      const last = msgs[msgs.length - 1] as any;
      if (!last || (last.type !== 'ai' && last.type !== 'system')) return;
      const text = (Array.isArray(last.content) ? last.content.map((c:any)=>c?.text||'').join('\n') : (last.content || '')).toString();
      const idBase = `${last.id || ''}|${(last as any).created_at || ''}`;
      if (/\bICP Profile\b/i.test(text)) {
        const key = `synthetic:icp:profile_ready:${idBase}`;
        if (!seenSynthetic.current.has(key)) {
          seenSynthetic.current.add(key);
          setEvents((prev) => [...prev, { id: key, label: 'icp:profile_ready', message: 'ICP Profile produced.', ts: Date.now() }].slice(-200));
        }
      }
      if (/Top[-\s]?listed lookalikes/i.test(text) || /\|\s*Domain\s*\|/i.test(text)) {
        const key = `synthetic:icp:toplikes_ready:${idBase}`;
        if (!seenSynthetic.current.has(key)) {
          seenSynthetic.current.add(key);
          setEvents((prev) => [...prev, { id: key, label: 'icp:toplikes_ready', message: 'Top-listed lookalikes (with why) produced.', ts: Date.now() }].slice(-200));
        }
      }
    } catch (_err) {
      // ignore
      void 0;
    }
  }, [stream.messages]);

  const value = useMemo(() => ({ events, clear }), [events]);
  return <ChatProgressContext.Provider value={value}>{children}</ChatProgressContext.Provider>;
}

export function useChatProgress() {
  const ctx = useContext(ChatProgressContext);
  if (!ctx) throw new Error("useChatProgress must be used within ChatProgressProvider");
  return ctx;
}
