export const runtime = "nodejs";

type Params = { _path: string[] };

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
  if (method !== "GET" && method !== "HEAD") {
    const bodyText = await request.text();
    init.body = bodyText;
    (init as any).duplex = "half";
  }
  const resp = await fetch(url, init);
  return new Response(resp.body, { status: resp.status, headers: resp.headers });
}

export async function GET(request: Request, { params }: { params: Promise<Params> | Params }) {
  const { _path } = await params;
  return forward("GET", request, _path || []);
}
export async function POST(request: Request, { params }: { params: Promise<Params> | Params }) {
  const { _path } = await params;
  return forward("POST", request, _path || []);
}
export async function PUT(request: Request, { params }: { params: Promise<Params> | Params }) {
  const { _path } = await params;
  return forward("PUT", request, _path || []);
}
export async function PATCH(request: Request, { params }: { params: Promise<Params> | Params }) {
  const { _path } = await params;
  return forward("PATCH", request, _path || []);
}
export async function DELETE(request: Request, { params }: { params: Promise<Params> | Params }) {
  const { _path } = await params;
  return forward("DELETE", request, _path || []);
}
export async function OPTIONS(request: Request, { params }: { params: Promise<Params> | Params }) {
  const { _path } = await params;
  return forward("OPTIONS", request, _path || []);
}
