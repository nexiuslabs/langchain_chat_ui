export const runtime = "nodejs";

type Params = { _path: string[] };

// Align Undici internal timeouts with our desired proxy timeout so we don't hit
// 5-minute defaults (UND_ERR_HEADERS_TIMEOUT/UND_ERR_BODY_TIMEOUT) during long streams.
let __GLOBAL_UNDICI__: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Agent, setGlobalDispatcher } = require("undici");
  const proxyMs = Number(process.env.NEXT_BACKEND_TIMEOUT_MS || 600000); // reuse same knob
  const cushion = 120000; // +2 minutes
  const headersTimeout = Number(process.env.NEXT_HEADERS_TIMEOUT_MS || (proxyMs + cushion) || 3900000);
  const bodyTimeout = Number(process.env.NEXT_BODY_TIMEOUT_MS || (proxyMs + cushion) || 3900000);
  __GLOBAL_UNDICI__ = { Agent, setGlobalDispatcher, headersTimeout, bodyTimeout };
  setGlobalDispatcher(new Agent({
    connect: { timeout: 60000 },
    headersTimeout,
    bodyTimeout,
    connections: Number(process.env.NEXT_BACKEND_CONNECTIONS || 16),
    pipelining: 0,
  }));
} catch (_e) {
  // ignore if undici not available or already configured
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
  } catch { return undefined; }
}

async function targetUrl(req: Request, params: Promise<Params> | Params): Promise<string> {
  const { _path } = await params;
  const base = process.env.LANGGRAPH_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
  const path = (_path || []).join("/");
  const url = new URL(base);
  // Ensure trailing slash once
  const basePath = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  url.pathname = basePath + path;
  // Preserve query string
  const inUrl = new URL(req.url);
  url.search = inUrl.search;
  return url.toString();
}

async function forward(method: string, request: Request, params: Promise<Params> | Params) {
  const url = await targetUrl(request, params);
  const headers = new Headers();
  // Forward selected headers from client
  const auth = request.headers.get("authorization");
  const tenant = request.headers.get("x-tenant-id");
  const cookie = request.headers.get("cookie");
  if (auth) headers.set("authorization", auth);
  if (tenant) headers.set("x-tenant-id", tenant);
  if (cookie) headers.set("cookie", cookie);
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
  } catch { /* ignore */ }
  if (method !== "GET" && method !== "HEAD") {
    // Read fully to avoid body locking issues on edge runtime
    const bodyText = await request.text();
    init.body = bodyText;
    (init as any).duplex = "half";
  }
  // Prefer undici.fetch with dispatcher when present to enforce our timeouts/connections
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const undici = require("undici");
    const undiciFetch = (undici && undici.fetch) ? undici.fetch : null;
    const dispatcher = getDispatcher();
    if (undiciFetch && dispatcher) {
      const resp = await undiciFetch(url, { ...(init as any), dispatcher });
      return new Response(resp.body as any, {
        status: resp.status,
        headers: resp.headers as any,
      });
    }
  } catch (_e) { /* fallback to global fetch */ }
  const resp = await fetch(url, init);
  // Stream response back
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
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
