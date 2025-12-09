import { logProxyActivity } from "@/lib/server-proxy-logger";

export const runtime = "nodejs";

// Ensure Node/Undici doesn't kill long-running streams around 5 minutes.
// We align Undici's internal timeouts with our proxy timeout so AbortSignal governs.
// Note: only effective in nodejs runtime (not edge).
let __GLOBAL_UNDICI__: any = null;
let __UNDICI_READY = false;
async function ensureUndiciConfigured() {
  console.log("[proxy/backend] ensuring undici", {
    timeout: process.env.NEXT_BACKEND_TIMEOUT_MS,
    headersTimeout: process.env.NEXT_HEADERS_TIMEOUT_MS,
    bodyTimeout: process.env.NEXT_BODY_TIMEOUT_MS,
    nodeEnv: process.env.NODE_ENV,
  });
  if (__UNDICI_READY) return;
  try {
    // Undici is the fetch implementation in Node 18+/Next.js node runtime
    // headersTimeout/bodyTimeout are in milliseconds
    // If envs are not provided, fall back to a generous default (65 minutes)
    // or to NEXT_BACKEND_TIMEOUT_MS + small cushion when available.
    const { Agent, setGlobalDispatcher, fetch: undiciFetch } = await import("undici");
    const proxyMs = Number(process.env.NEXT_BACKEND_TIMEOUT_MS || 600000); // 10m default
    const cushion = 120000; // +2m cushion to avoid racing the AbortSignal
    const headersTimeout = Number(process.env.NEXT_HEADERS_TIMEOUT_MS || (proxyMs + cushion) || 3900000);
    const bodyTimeout = Number(process.env.NEXT_BODY_TIMEOUT_MS || (proxyMs + cushion) || 3900000);
    console.log("[proxy/backend] undici ready", { headersTimeout, bodyTimeout });
    __GLOBAL_UNDICI__ = { Agent, setGlobalDispatcher, headersTimeout, bodyTimeout, undiciFetch };
    setGlobalDispatcher(new Agent({
      connect: { timeout: 60000 }, // 60s connect timeout
      headersTimeout,
      bodyTimeout,
      connections: Number(process.env.NEXT_BACKEND_CONNECTIONS || 16),
      pipelining: 0,
    }));
    __UNDICI_READY = true;
  } catch (err) {
    console.error("[proxy/backend] undici import failed", err);
  }
}

function getDispatcher(): any | undefined {
  try {
    if (!__GLOBAL_UNDICI__) return undefined;
    const { Agent } = __GLOBAL_UNDICI__;
    const headersTimeout = __GLOBAL_UNDICI__.headersTimeout as number;
    const bodyTimeout = __GLOBAL_UNDICI__.bodyTimeout as number;
    return new Agent({
      connect: { timeout: 60000 },
      headersTimeout,
      bodyTimeout,
      connections: Number(process.env.NEXT_BACKEND_CONNECTIONS || 16),
      pipelining: 0,
    });
  } catch (_err) { return undefined; }
}

type Params = { _path: string[] };

const LANGGRAPH_PREFIXES = new Set(["assistants", "deployments", "runs", "schemas", "assets"]);

async function segmentsFromContext(ctx: any): Promise<string[]> {
  try {
    const p = ctx?.params;
    if (!p) return [];
    // In dev, Next passes params as a Promise; in prod it may be a plain object.
    const val = typeof p.then === "function" ? await p : p;
    const segs = (val as Params)?._path || [];
    return Array.isArray(segs) ? segs : [];
  } catch (e) {
    void e;
    return [];
  }
}

function resolveBackendBase(firstSegment: string | undefined): string {
  // Use existing env names from .env.local
  // LangGraph dev or proxy base (e.g., http://localhost:8001)
  const langgraphBase = process.env.NEXT_PUBLIC_API_URL || process.env.LANGGRAPH_API_URL || "";
  // FastAPI base (e.g., http://localhost:8000)
  const fastapiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || langgraphBase || "";
  const seg = (firstSegment || "").toLowerCase();
  // Route threads to FastAPI so DB-backed thread creation/resume hits our API
  if (seg === "threads") {
    return fastapiBase;
  }
  // Route runs/stream and other LangGraph server endpoints to LANGGRAPH_API_URL when set
  if (seg && LANGGRAPH_PREFIXES.has(seg)) {
    return langgraphBase || fastapiBase;
  }
  return fastapiBase;
}

function targetUrlFromSegments(req: Request, segments: string[]): string {
  const base = resolveBackendBase((segments || [])[0]);
  const url = new URL(base);
  const basePath = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  url.pathname = basePath + (segments || []).join("/");
  const inUrl = new URL(req.url);
  url.search = inUrl.search;
  return url.toString();
}

function summarizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_err) {
    return raw;
  }
}

async function forward(method: string, request: Request, segments: string[]) {
  await ensureUndiciConfigured();
  // Guard against explicitly invalid thread IDs, but allow collection routes like GET /threads
  try {
    if ((segments?.[0] || "").toLowerCase() === "threads") {
      const seg1 = (segments?.[1] || "").trim();
      const seg2 = (segments?.[2] || "").trim().toLowerCase();
      const isCollectionRoute = !seg1; // e.g., /threads
      const requiresId = !!seg1 || ["runs", "history"].includes(seg2);
      if (!isCollectionRoute && (seg1 === "undefined" || seg1 === "null")) {
        return new Response("thread_id is required", { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      // If a subresource explicitly requires an id but none is present
      if (!seg1 && ["runs", "history"].includes(seg2)) {
        return new Response("thread_id is required", { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    }
  } catch (_e) { /* ignore */ }
  const url = targetUrlFromSegments(request, segments);
  const logUrl = summarizeUrl(url);
  const started = Date.now();
  logProxyActivity({ scope: "backend", phase: "request", method, url: logUrl });
  const headers = new Headers();
  const auth = request.headers.get("authorization");
  const tenant = request.headers.get("x-tenant-id");
  const cookie = request.headers.get("cookie");
  const accept = request.headers.get("accept");
  if (auth) headers.set("authorization", auth);
  if (tenant) headers.set("x-tenant-id", tenant);
  if (cookie) headers.set("cookie", cookie);
  if (accept) headers.set("accept", accept);
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (apiKey) headers.set("x-api-key", apiKey);

  const init: RequestInit = { method, headers };
  // Extend backend timeout to tolerate long-running streams
  const timeoutMs = Number(process.env.NEXT_BACKEND_TIMEOUT_MS || 600000); // 10 minutes
  try {
    // AbortSignal.timeout is available in modern Node runtimes
    (init as any).signal = (AbortSignal as any).timeout(timeoutMs);
  } catch (e) {
    void e; // Ignore if not available; default runtime limits apply
  }
  // Ensure requests use a dispatcher with ample timeouts and multiple connections
  try {
    const d = getDispatcher();
    if (d) (init as any).dispatcher = d;
  } catch (_err) { /* ignore */ }
  // Ensure Accept header is text/event-stream for run streaming endpoints
  try {
    const isRunStart = segments.length >= 3 && segments[0] === "threads" && (segments[2] as string).startsWith("runs");
    const isStream = isRunStart && ((segments[2] === "runs" && segments[3] === "stream") || segments[2] === "runs/stream");
    if (isStream) {
      headers.set("accept", "text/event-stream");
    }
  } catch (_e) {
    /* ignore */
  }

  try {
    if (method !== "GET" && method !== "HEAD") {
      const bodyText = await request.text();
      let finalBody = bodyText;
      try {
        // Expect segments like: ["threads", "<thread_id>", "runs", ("stream")?]
        const isRunStart = segments.length >= 3 && segments[0] === "threads" && segments[2].startsWith("runs");
        const isStream = isRunStart && (segments[2] === "runs" && segments[3] === "stream" || segments[2] === "runs/stream");
        const looksJson = !!bodyText && bodyText.trim().startsWith("{");
        const threadId = segments[1];
      const payload: any = looksJson ? JSON.parse(bodyText) : undefined;
        // Inject session_id for binding and pass tenant_id into context
        if (isRunStart && looksJson && payload) {
          // Preserve user input if it's a primitive (string/number/bool). Only coerce when it's an object.
          const isPrimitiveInput = ["string", "number", "boolean"].includes(typeof payload.input);
          if (!isPrimitiveInput) {
            const input = (payload?.input && typeof payload.input === "object") ? payload.input : {};
            (input as any).session_id = (input as any).session_id || threadId;
            payload.input = input;
          }
          payload.session_id = payload.session_id || threadId;
          const tidHeader = request.headers.get("x-tenant-id");
          payload.context = {
            ...(payload.context || {}),
            session_id: threadId,
            ...(tidHeader ? { tenant_id: tidHeader } : {}),
          };
        }
        // Do not block empty payloads; graph may resume from checkpoint.
        if (isRunStart && looksJson && payload) {
          finalBody = JSON.stringify(payload);
          headers.set("content-type", "application/json");
        }
      } catch (_e) {
        finalBody = bodyText;
      }
      init.body = finalBody;
      (init as any).duplex = "half";
    }
    // Use undici fetch with dispatcher when available to avoid Next's internal fetch limits
    try {
      const undiciFetch = __GLOBAL_UNDICI__?.undiciFetch as any;
      const dispatcher = getDispatcher();
      if (undiciFetch && dispatcher) {
        const resp = await undiciFetch(url, { ...(init as any), dispatcher });
        logProxyActivity({
          scope: "backend",
          phase: "response",
          method,
          url: logUrl,
          status: resp.status,
          duration_ms: Date.now() - started,
        });
        const rawHeaders = resp.headers as any;
        const headersOut = new Headers(rawHeaders);
        headersOut.delete("content-length");
        return new Response(resp.body as any, { status: resp.status, headers: headersOut });
      }
    } catch (_err) {
      /* fall back to global fetch */
    }
    const resp = await fetch(url, init);
    logProxyActivity({
      scope: "backend",
      phase: "response",
      method,
      url: logUrl,
      status: resp.status,
      duration_ms: Date.now() - started,
    });
    // Extra diagnostics for auth endpoints: log presence of Set-Cookie
    try {
      const first = (segments?.[0] || "").toLowerCase();
      const second = (segments?.[1] || "").toLowerCase();
      const isAuthEndpoint = first === "auth" && ["login", "exchange", "refresh"].includes(second);
      if (isAuthEndpoint) {
        let setCookieCount = 0;
        let hasSetCookie = false;
        const hdrs: any = resp.headers as any;
        try {
          if (typeof hdrs.getSetCookie === 'function') {
            const arr = hdrs.getSetCookie();
            setCookieCount = Array.isArray(arr) ? arr.length : 0;
            hasSetCookie = setCookieCount > 0;
          } else {
            const v = hdrs.get && hdrs.get('set-cookie');
            hasSetCookie = !!v;
            setCookieCount = v ? 1 : 0;
          }
        } catch { /* ignore */ }
        logProxyActivity({
          scope: "backend",
          phase: "response",
          method,
          url: logUrl,
          status: resp.status,
          duration_ms: Date.now() - started,
          data: { endpoint: `${first}/${second}`, has_set_cookie: hasSetCookie, set_cookie_count: setCookieCount },
        });
      }
    } catch { /* ignore */ }
    // Friendly error surface for stale thread on run stream
    try {
      const first = (segments?.[0] || "").toLowerCase();
      const seg2 = (segments?.[2] || "").toLowerCase();
      const isRuns = first === "threads" && (seg2 === "runs" || seg2 === "runs/stream" || seg2.startsWith("runs"));
      if (isRuns && resp.status === 404) {
        const msg = { error: "thread_missing", message: "Thread expired or missing. Start a new chat.", thread_id: segments?.[1] };
        return new Response(JSON.stringify(msg), { status: 404, headers: { "content-type": "application/json" } });
      }
    } catch (_err) { /* ignore */ }
    const headersOut = new Headers(resp.headers);
    headersOut.delete("content-length");
    return new Response(resp.body, { status: resp.status, headers: headersOut });
  } catch (error: any) {
    logProxyActivity({
      scope: "backend",
      phase: "error",
      method,
      url: logUrl,
      duration_ms: Date.now() - started,
      message: error?.message || "proxy error",
      error_code: error?.code,
    });
    throw error;
  }
}

export async function GET(request: Request, ctx: any) {
  const segs = await segmentsFromContext(ctx);
  return forward("GET", request, segs);
}
export async function POST(request: Request, ctx: any) {
  const segs = await segmentsFromContext(ctx);
  return forward("POST", request, segs);
}
export async function PUT(request: Request, ctx: any) {
  const segs = await segmentsFromContext(ctx);
  return forward("PUT", request, segs);
}
export async function PATCH(request: Request, ctx: any) {
  const segs = await segmentsFromContext(ctx);
  return forward("PATCH", request, segs);
}
export async function DELETE(request: Request, ctx: any) {
  const segs = await segmentsFromContext(ctx);
  return forward("DELETE", request, segs);
}
export async function OPTIONS(request: Request, ctx: any) {
  const segs = await segmentsFromContext(ctx);
  return forward("OPTIONS", request, segs);
}
