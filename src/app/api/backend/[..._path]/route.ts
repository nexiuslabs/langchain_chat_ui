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

function targetUrlFromSegments(req: Request, segments: string[]): string {
  const base = process.env.LANGGRAPH_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
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
  const url = targetUrlFromSegments(request, segments);
  const logUrl = summarizeUrl(url);
  const started = Date.now();
  logProxyActivity({ scope: "backend", phase: "request", method, url: logUrl });
  const headers = new Headers();
  const auth = request.headers.get("authorization");
  const tenant = request.headers.get("x-tenant-id");
  const cookie = request.headers.get("cookie");
  if (auth) headers.set("authorization", auth);
  if (tenant) headers.set("x-tenant-id", tenant);
  if (cookie) headers.set("cookie", cookie);
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
  try {
    if (method !== "GET" && method !== "HEAD") {
      const bodyText = await request.text();
      let finalBody = bodyText;
      // Inject a session_id derived from thread_id for run-start APIs so backend can bind SSE
      try {
        // Expect segments like: ["threads", "<thread_id>", "runs", ("stream")?]
        const isRunStart = segments.length >= 3 && segments[0] === "threads" && segments[2].startsWith("runs");
        if (isRunStart && bodyText && bodyText.trim().startsWith("{")) {
          const threadId = segments[1];
          const payload: any = JSON.parse(bodyText);
          const input = (payload?.input && typeof payload.input === "object") ? payload.input : (typeof payload === "object" ? payload : {});
          // Place session_id in multiple places for maximum compatibility
          input.session_id = input.session_id || threadId;
          payload.input = input;
          payload.session_id = payload.session_id || threadId;
          payload.context = { ...(payload.context || {}), session_id: threadId };
          finalBody = JSON.stringify(payload);
          // Ensure JSON content-type
          headers.set("content-type", "application/json");
        }
      } catch (e) {
        // On any parsing error, fall back to original body
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
        return new Response(resp.body as any, { status: resp.status, headers: resp.headers as any });
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
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
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
