export const runtime = "nodejs";

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

async function forward(method: string, request: Request, segments: string[]) {
  const url = targetUrlFromSegments(request, segments);
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
  if (method !== "GET" && method !== "HEAD") {
    const bodyText = await request.text();
    init.body = bodyText;
    (init as any).duplex = "half";
  }
  const resp = await fetch(url, init);
  return new Response(resp.body, { status: resp.status, headers: resp.headers });
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
