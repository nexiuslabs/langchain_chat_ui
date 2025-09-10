export const runtime = "edge";

type Ctx = { params: { _path: string[] } };

function targetUrl(req: Request, params: Ctx["params"]): string {
  const base = process.env.LANGGRAPH_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
  const path = (params?._path || []).join("/");
  const url = new URL(base);
  // Ensure trailing slash once
  const basePath = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  url.pathname = basePath + path;
  // Preserve query string
  const inUrl = new URL(req.url);
  url.search = inUrl.search;
  return url.toString();
}

async function forward(method: string, request: Request, ctx: Ctx) {
  const url = targetUrl(request, ctx.params);
  const headers = new Headers();
  // Forward selected headers from client
  const auth = request.headers.get("authorization");
  const tenant = request.headers.get("x-tenant-id");
  if (auth) headers.set("authorization", auth);
  if (tenant) headers.set("x-tenant-id", tenant);
  // Content negotiation
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  // Include LangSmith API key for deployed graphs if configured
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (apiKey) headers.set("x-api-key", apiKey);

  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
    // Edge runtime requires duplex for streaming
    (init as any).duplex = "half";
  }
  const resp = await fetch(url, init);
  // Stream response back
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
}

export async function GET(request: Request, ctx: Ctx) {
  return forward("GET", request, ctx);
}
export async function POST(request: Request, ctx: Ctx) {
  return forward("POST", request, ctx);
}
export async function PUT(request: Request, ctx: Ctx) {
  return forward("PUT", request, ctx);
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward("PATCH", request, ctx);
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward("DELETE", request, ctx);
}
export async function OPTIONS(request: Request, ctx: Ctx) {
  return forward("OPTIONS", request, ctx);
}
