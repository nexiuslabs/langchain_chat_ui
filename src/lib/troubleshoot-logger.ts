/* Lightweight client logger strictly for troubleshooting */

const ENV = (process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || 'dev');
const SERVICE = 'web';
const RELEASE = process.env.NEXT_PUBLIC_RELEASE || '';
// Primary sink: backend LangGraph/FastAPI ingestion (default)
// Optional secondary sink: UI-local ingestion when enabled
const UI_INGEST = '/api/logs';
// Backend sink resolves via proxy or direct URL
const USE_PROXY = (process.env.NEXT_PUBLIC_USE_API_PROXY || '').toLowerCase() === 'true';
const BACKEND_INGEST = USE_PROXY
  ? '/api/backend/v1/logs'
  : ((process.env.NEXT_PUBLIC_API_URL || '') + '/v1/logs');
// Toggle sending to UI sink as well (default false → backend-only)
const LOG_TO_UI = (() => {
  const forced = process.env.NEXT_PUBLIC_LOG_TO_UI;
  if (typeof forced === 'string' && forced.length > 0) {
    return forced.toLowerCase() === 'true';
  }
  return process.env.NODE_ENV !== 'production';
})();

// Simple leaky‑bucket rate limiter (≈2 ev/s avg, 10 burst)
let tokens = 10; let last = Date.now();
function allowed(): boolean {
  const now = Date.now();
  tokens = Math.min(10, tokens + ((now - last) / 1000) * 2);
  last = now; if (tokens < 1) return false; tokens -= 1; return true;
}

// 30s dedupe for identical signatures
const recent = new Set<string>();
function dedupeKey(e: any): string {
  return [e.level, e.message, e.component, e.error?.type, e.error?.stack?.[0]].join('|');
}
function keep(e: any): boolean {
  const key = dedupeKey(e);
  if (recent.has(key)) return false;
  recent.add(key); setTimeout(() => recent.delete(key), 30_000); return true;
}

// Prefer sendBeacon; fall back to fetch POST
async function send(events: any[]) {
  const payload = JSON.stringify({ events });
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      // Prefer backend sink
      const ok = navigator.sendBeacon(BACKEND_INGEST, blob);
      // Optionally also send to UI sink
      if (LOG_TO_UI) {
        try { navigator.sendBeacon(UI_INGEST, blob); } catch { /* ignore */ }
      }
      if (ok && !LOG_TO_UI) return;
    }
  } catch { /* ignore */ }
  try {
    // Backend sink (primary)
    await fetch(BACKEND_INGEST, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    });
    if (LOG_TO_UI) {
      try {
        await fetch(UI_INGEST, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export type FELog = {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  component?: string;
  session_id?: string;
  route?: string;
  http?: { method?: string; host?: string; status?: number; duration_ms?: number };
  error?: { type?: string; message?: string; stack?: string[] };
  data?: Record<string, unknown>;
};

export function logEvent(ev: FELog) {
  try {
    if (!allowed()) return;
    const event = {
      timestamp: new Date().toISOString(),
      level: ev.level,
      service: SERVICE,
      environment: ENV,
      release: RELEASE,
      message: String(ev.message || '').slice(0, 512),
      session_id: ev.session_id,
      component: ev.component,
      route: ev.route,
      http: ev.http,
      error: ev.error,
      data: ev.data,
    } as any;
    if (!keep(event)) return;
    void send([event]);
  } catch { /* ignore */ }
}

export function installGlobalErrorHandlers(getCtx?: () => { session_id?: string; route?: string }) {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    try {
      const ctx = getCtx?.() || {};
      const err: any = (e as any)?.error || e;
      logEvent({
        level: 'error',
        message: err?.message || (e as any)?.message || 'Unhandled error',
        component: 'window.onerror',
        session_id: ctx.session_id,
        route: ctx.route,
        error: {
          type: err?.name || 'Error',
          message: err?.message || (e as any)?.message,
          stack: String(err?.stack || '').split('\n').slice(0, 6),
        },
      });
    } catch { /* ignore */ }
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    try {
      const reason: any = (e && (e.reason ?? e)) || {};
      const ctx = getCtx?.() || {};
      logEvent({
        level: 'error',
        message: reason?.message || 'Unhandled rejection',
        component: 'window.unhandledrejection',
        session_id: ctx.session_id,
        route: ctx.route,
        error: {
          type: reason?.name || 'UnhandledRejection',
          message: reason?.message || String(reason),
          stack: String(reason?.stack || '').split('\n').slice(0, 6),
        },
      });
    } catch { /* ignore */ }
  });
}
