"use client";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStreamContext } from "@/providers/Stream";

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

  const clear = () => setEvents([]);

  // Stable handlers
  const push = (label: string, payload: any) => {
    try {
      const data = typeof payload === "string" ? (() => { try { return JSON.parse(payload); } catch { return { message: String(payload) }; } })() : payload;
      const msg = typeof data?.message === "string" ? data.message : undefined;
      setEvents((prev) => {
        const next = [...prev, { id: `${label}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, label, message: msg, data, ts: Date.now() }];
        // keep last 200
        return next.slice(-200);
      });
    } catch {
      setEvents((prev) => [...prev, { id: `${label}:${Date.now()}`, label, message: String(payload), ts: Date.now() }].slice(-200));
    }
  };

  useEffect(() => {
    // Start/stop EventSource on session change
    if (!sessionId) {
      if (esRef.current) {
        try { esRef.current.close(); } catch { void 0; }
        esRef.current = null;
      }
      return;
    }
    const url = buildStreamUrl(sessionId);
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
        // Let browser auto-reconnect; optionally log a soft event
        void 0;
      };
    } catch {
      // Silent fail; UI remains functional without stream
      void 0;
    }
    return () => {
      try { esRef.current?.close(); } catch { void 0; }
      esRef.current = null;
    };
  }, [sessionId]);

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
    } catch {
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
