import { logProxyActivity } from "@/lib/server-proxy-logger";

export const runtime = "nodejs";

type Params = { _path: string[] };

// Configure Undici dispatcher lazily to align timeouts with proxy timeout.
let __GLOBAL_UNDICI__: any = null;
let __UNDICI_READY = false;
async function ensureUndiciConfigured() {
  console.log("[proxy/api] ensuring undici", {
    timeout: process.env.NEXT_BACKEND_TIMEOUT_MS,
    headersTimeout: process.env.NEXT_HEADERS_TIMEOUT_MS,
    bodyTimeout: process.env.NEXT_BODY_TIMEOUT_MS,
    nodeEnv: process.env.NODE_ENV,
  });
  if (__UNDICI_READY) return;
  try {
    const { Agent, setGlobalDispatcher, fetch: undiciFetch } = await import("undici");
    const proxyMs = Number(process.env.NEXT_BACKEND_TIMEOUT_MS || 600000);
    const cushion = 120000; // +2 minutes
    const headersTimeout = Number(process.env.NEXT_HEADERS_TIMEOUT_MS || (proxyMs + cushion) || 3900000);
    const bodyTimeout = Number(process.env.NEXT_BODY_TIMEOUT_MS || (proxyMs + cushion) || 3900000);
    console.log("[proxy/api] undici ready", { headersTimeout, bodyTimeout });
    __GLOBAL_UNDICI__ = { Agent, setGlobalDispatcher, headersTimeout, bodyTimeout, undiciFetch };
    setGlobalDispatcher(new Agent({
      connect: { timeout: 60000 },
      headersTimeout,
      bodyTimeout,
      connections: Number(process.env.NEXT_BACKEND_CONNECTIONS || 16),
      pipelining: 0,
    }));
    __UNDICI_READY = true;
  } catch (err) {
    console.error("[proxy/api] undici import failed", err);
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

const LANGGRAPH_PREFIXES = new Set(["assistants", "deployments", "runs", "schemas", "assets"]);

function resolveBaseUrlForSegments(segments: string[]): string {
  const langgraphBase = process.env.NEXT_PUBLIC_API_URL || process.env.LANGGRAPH_API_URL || "";
  const fastapiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || langgraphBase || "";
  const seg0 = (segments?.[0] || "").toLowerCase();
  // Special-case: route thread runs/history to LangGraph; CRUD to FastAPI
  if (seg0 === "threads") {
    const seg2 = (segments?.[2] || "").toLowerCase();
    const isRuns = seg2 === "runs" || seg2 === "runs/stream" || seg2.startsWith("runs");
    const isHistory = seg2 === "history";
    if (isRuns || isHistory) return langgraphBase || fastapiBase;
    return fastapiBase;
  }
  if (seg0 && LANGGRAPH_PREFIXES.has(seg0)) {
    return langgraphBase || fastapiBase;
  }
  return fastapiBase;
}

async function targetUrl(req: Request, params: Promise<Params> | Params): Promise<string> {
  const { _path } = await params;
  const segments = _path || [];
  const path = segments.join("/");
  const base = resolveBaseUrlForSegments(segments);
  const url = new URL(base);
  // Ensure trailing slash once
  const basePath = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  url.pathname = basePath + path;
  // Preserve query string
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

async function forward(method: string, request: Request, params: Promise<Params> | Params) {
  await ensureUndiciConfigured();
  const { _path } = await params;
  let segments = _path || [];
  // Guard against explicitly invalid thread IDs, but allow collection routes like GET /threads
  try {
    if ((segments?.[0] || "").toLowerCase() === "threads") {
      const seg1 = (segments?.[1] || "").trim();
      const seg2 = (segments?.[2] || "").trim().toLowerCase();
      const isCollectionRoute = !seg1; // e.g., /threads
      if (!isCollectionRoute && (seg1 === "undefined" || seg1 === "null")) {
        return new Response("thread_id is required", { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      // If a subresource explicitly requires an id but none is present
      if (!seg1 && ["runs", "history"].includes(seg2)) {
        return new Response("thread_id is required", { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      // Resolve runtime thread id from backend mapping and rewrite segments[1]
      if (seg1) {
        try {
          const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
          const backendBase = useProxy ? "/api/backend" : (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "");
          if (backendBase) {
            const url = `${(backendBase || '').replace(/\/$/, '')}/threads/${encodeURIComponent(seg1)}/runtime`;
            const r = await fetch(url, {
              method: 'GET',
              headers: {
                'accept': 'application/json',
                // Propagate tenant header if present
                ...(request.headers.get('x-tenant-id') ? { 'x-tenant-id': String(request.headers.get('x-tenant-id')) } : {}),
                ...(request.headers.get('authorization') ? { 'authorization': String(request.headers.get('authorization')) } : {}),
                // Include cookies so backend sees the session
                ...(request.headers.get('cookie') ? { 'cookie': String(request.headers.get('cookie')) } : {}),
              },
              credentials: 'include' as any,
            });
            if (r.ok) {
              const data = await r.json().catch(() => ({}));
              const rid = data?.runtime_thread_id;
              if (typeof rid === 'string' && rid) {
                segments = [segments[0], rid, ...segments.slice(2)];
              }
            }
          }
        } catch { /* ignore and forward as-is */ }
      }
    }
  } catch (_e) { /* ignore */ }

  const url = await targetUrl(request, params);
  const logUrl = summarizeUrl(url);
  const started = Date.now();
  logProxyActivity({ scope: "api", phase: "request", method, url: logUrl });
  const headers = new Headers();
  // Forward selected headers from client
  const auth = request.headers.get("authorization");
  const tenant = request.headers.get("x-tenant-id");
  const cookie = request.headers.get("cookie");
  const accept = request.headers.get("accept");
  if (auth) headers.set("authorization", auth);
  if (tenant) headers.set("x-tenant-id", tenant);
  if (cookie) headers.set("cookie", cookie);
  if (accept) headers.set("accept", accept);
  // Do not forward accept-encoding to avoid compressing SSE
  // Content negotiation
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  // Include LangSmith API key for deployed graphs if configured
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (apiKey) headers.set("x-api-key", apiKey);

  const init: RequestInit = { method, headers };
  // Apply a long timeout so long-running calls and streams don't get cut off.
  const timeoutMs = Number(process.env.NEXT_BACKEND_TIMEOUT_MS || 600000); // 10 minutes default
  try {
    (init as any).signal = (AbortSignal as any).timeout(timeoutMs);
  } catch (e) {
    void e;
  }
  try {
    const d = getDispatcher();
    if (d) (init as any).dispatcher = d;
  } catch (_err) { /* ignore */ }
  // Detect run stream path to ensure Accept header is SSE
  let isRunStart = false;
  let isStream = false;
  try {
    const segs = await params;
    const segments = (segs as any)?._path || [];
    isRunStart = segments.length >= 3 && segments[0] === "threads" && (segments[2] as string).startsWith("runs");
    isStream = isRunStart && ((segments[2] === "runs" && segments[3] === "stream") || segments[2] === "runs/stream");
  } catch (_e) {
    /* ignore */
  }
  if (isStream) {
    headers.set("accept", "text/event-stream");
  }

  try {
  if (method !== "GET" && method !== "HEAD") {
    // Read fully to avoid body locking issues on edge runtime
    const bodyText = await request.text();
    let finalBody = bodyText;
    try {
      const segs = await params;
      const segments = (segs as any)?._path || [];
      const isRunStart = segments.length >= 3 && segments[0] === "threads" && (segments[2] as string).startsWith("runs");
      const isStream = isRunStart && ((segments[2] === "runs" && segments[3] === "stream") || segments[2] === "runs/stream");
      const looksJson = !!bodyText && bodyText.trim().startsWith("{");
      const threadId = segments[1];
      const payload: any = looksJson ? JSON.parse(bodyText) : undefined;
      // Allow empty payloads to pass through; the graph may intentionally resume from checkpoint.
      // Inject a session_id derived from thread_id for run-start APIs so backend can bind SSE
      if (isRunStart && looksJson && payload) {
        // Preserve user input if it's a primitive; only coerce when it's an object
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
        finalBody = JSON.stringify(payload);
        headers.set("content-type", "application/json");
      }
    } catch (_e) {
      finalBody = bodyText;
    }
    init.body = finalBody;
    (init as any).duplex = "half";
  }
    // Prefer undici.fetch with dispatcher when present to enforce our timeouts/connections
    try {
      const undiciFetch = __GLOBAL_UNDICI__?.undiciFetch as any;
      const dispatcher = getDispatcher();
      if (undiciFetch && dispatcher) {
        const resp = await undiciFetch(url, { ...(init as any), dispatcher });
        logProxyActivity({
          scope: "api",
          phase: "response",
          method,
          url: logUrl,
          status: resp.status,
          duration_ms: Date.now() - started,
        });
        const rawHeaders = resp.headers as any;
        const headersOut = new Headers(rawHeaders);
        headersOut.delete("content-length");
        return new Response(resp.body as any, {
          status: resp.status,
          headers: headersOut,
        });
      }
    } catch (_err) {
      /* fallback to global fetch */
    }
    const resp = await fetch(url, init);
    logProxyActivity({
      scope: "api",
      phase: "response",
      method,
      url: logUrl,
      status: resp.status,
      duration_ms: Date.now() - started,
    });
    // Auto-recover stale threads for LangGraph history/runs calls: create and retry once
    try {
      const first = (segments?.[0] || "").toLowerCase();
      const seg2 = (segments?.[2] || "").toLowerCase();
      const isRuns = first === "threads" && (seg2 === "runs" || seg2 === "runs/stream" || seg2.startsWith("runs"));
      const isHistory = first === "threads" && seg2 === "history";
      if ((isRuns || isHistory) && resp.status === 404) {
        // Best-effort create: POST /threads (LangGraph base) with explicit thread_id
        const langgraphBase = process.env.NEXT_PUBLIC_API_URL || process.env.LANGGRAPH_API_URL || "";
        if (langgraphBase) {
          const createUrl = new URL(langgraphBase);
          const basePath = createUrl.pathname.endsWith("/") ? createUrl.pathname : createUrl.pathname + "/";
          createUrl.pathname = basePath + "threads";
          const tid = segments?.[1];
          const headersCreate: Record<string, string> = { "content-type": "application/json" };
          const apiKey = process.env.LANGSMITH_API_KEY;
          if (apiKey) headersCreate["x-api-key"] = apiKey;
          const tenant = request.headers.get("x-tenant-id");
          if (tenant) headersCreate["x-tenant-id"] = tenant;
          try {
            // Many LangGraph servers accept `thread_id` for explicit IDs
            const cr = await fetch(createUrl.toString(), { method: "POST", headers: headersCreate, body: JSON.stringify({ thread_id: tid }) });
            if (cr.ok) {
              // Retry original request once
              const retry = await fetch(url, init);
              const headersRetry = new Headers(retry.headers);
              headersRetry.delete("content-length");
              return new Response(retry.body, { status: retry.status, headers: headersRetry });
            }
          } catch (_er) { /* ignore */ }
        }
        // Friendly error if still missing
        const msg = { error: "thread_missing", message: "Thread expired or missing. Start a new chat.", thread_id: segments?.[1] };
        return new Response(JSON.stringify(msg), { status: 404, headers: { "content-type": "application/json" } });
      }
    } catch (_err) { /* ignore */ }
    // Stream response back, but drop conflicting CL header
    const headersOut = new Headers(resp.headers);
    headersOut.delete("content-length");
    return new Response(resp.body, {
      status: resp.status,
      headers: headersOut,
    });
  } catch (error: any) {
    logProxyActivity({
      scope: "api",
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
  return forward("GET", request, ctx?.params);
}
export async function POST(request: Request, ctx: any) {
  return forward("POST", request, ctx?.params);
}
export async function PUT(request: Request, ctx: any) {
  return forward("PUT", request, ctx?.params);
}
export async function PATCH(request: Request, ctx: any) {
  return forward("PATCH", request, ctx?.params);
}
export async function DELETE(request: Request, ctx: any) {
  return forward("DELETE", request, ctx?.params);
}
export async function OPTIONS(request: Request, ctx: any) {
  return forward("OPTIONS", request, ctx?.params);
}
