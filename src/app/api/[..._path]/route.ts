export const runtime = "edge";

type Params = { _path: string[] };

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
  if (method !== "GET" && method !== "HEAD") {
    // Read fully to avoid body locking issues on edge runtime
    const bodyText = await request.text();
    init.body = bodyText;
    (init as any).duplex = "half";
  }
  const resp = await fetch(url, init);
  // Stream response back
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
}

export async function GET(request: Request, { params }: { params: Promise<Params> | Params }) {
  return forward("GET", request, params);
}
export async function POST(request: Request, { params }: { params: Promise<Params> | Params }) {
  return forward("POST", request, params);
}
export async function PUT(request: Request, { params }: { params: Promise<Params> | Params }) {
  return forward("PUT", request, params);
}
export async function PATCH(request: Request, { params }: { params: Promise<Params> | Params }) {
  return forward("PATCH", request, params);
}
export async function DELETE(request: Request, { params }: { params: Promise<Params> | Params }) {
  return forward("DELETE", request, params);
}
export async function OPTIONS(request: Request, { params }: { params: Promise<Params> | Params }) {
  return forward("OPTIONS", request, params);
}
