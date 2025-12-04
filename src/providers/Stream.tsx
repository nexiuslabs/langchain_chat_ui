import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useRef,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey } from "@/lib/api-key";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { mergeThreadLists } from "@/lib/threadTenants";
import { createClient } from "./client";
import { useTenant } from "@/providers/Tenant";

export type StateType = { messages: Message[]; ui?: UIMessage[] };

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream>;
const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  {
    idToken,
    tenantId,
  }: { idToken?: string; tenantId?: string | null } = {},
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};

    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }

    if (tenantId) {
      headers["X-Tenant-ID"] = tenantId;
    }

    if (
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_USE_AUTH_HEADER === "true" &&
      idToken
    ) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
    const infoUrl = useProxy ? "/api/info" : `${apiUrl}/info`;
    const altUrl = useProxy ? "/api/assistants?limit=1" : `${apiUrl}/assistants?limit=1`;

    const res = await fetch(infoUrl, { credentials: "include", headers });
    if (res.ok) return true;
    // Treat common auth/method errors as "reachable" (server up but protected)
    if ([401, 403, 404, 405].includes(res.status)) return true;
    // Fallback to a LangGraph endpoint that is typically open in local dev
    try {
      const r2 = await fetch(altUrl, { credentials: "include", headers });
      if (r2.ok) return true;
      if ([401, 403, 404, 405].includes(r2.status)) return true;
    } catch (e) { void e; }
    return false;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
}) => {
  const { data: session, status } = useSession();
  const idToken = (session as any)?.idToken as string | undefined;
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  const { tenantId: storedTenantId } = useTenant();
  const checkingRef = useRef(false);
  const toastShownRef = useRef(false);
  const effectiveTenantId = storedTenantId || sessionTenantId || null;
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();

  // Pre-create a tenant-scoped thread to ensure metadata is attached
  const precreatedRef = useRef(false);
  useEffect(() => {
    // If a threadId is present from URL/history but no longer exists on the server,
    // clear it so we can pre-create a fresh tenant-scoped thread below.
    (async () => {
      if (!threadId || threadId === 'undefined' || threadId === 'null') return;
      try {
        const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
        const base = useProxy
          ? "/api/backend"
          : ((process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || apiUrl || ""));
        const res = await fetch(`${(base || "").replace(/\/$/, "")}/threads/${threadId}`, {
          credentials: "include",
          headers: {
            ...(effectiveTenantId ? { "X-Tenant-ID": effectiveTenantId } : {}),
            ...(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_AUTH_HEADER === 'true' && idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        });
        if (res.status === 404) {
          // Stale thread – drop it to avoid racing runs on a missing thread
          setThreadId(null);
        }
      } catch (_e) {
        // ignore network errors; we'll proceed with current threadId
      }
    })();

    // No-op: do not PATCH thread metadata here; FastAPI PATCH expects a label

    if (precreatedRef.current) return;
    if (threadId) return; // already have a thread
    if (!assistantId) return;
    // Require tenant id to avoid cross-tenant ambiguity
    if (!effectiveTenantId) return;
    try {
      const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
      const base = useProxy
        ? "/api/backend"
        : ((process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || ""));
      const url = `${(base || "").replace(/\/$/, "")}/threads`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (effectiveTenantId) headers["X-Tenant-ID"] = effectiveTenantId;
      if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_AUTH_HEADER === 'true' && idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }
      fetch(url, { method: 'POST', headers, credentials: 'include', body: JSON.stringify({}) })
        .then(async (r) => {
          if (!r.ok) return;
          const data = await r.json().catch(() => ({}));
          const id = data?.id || data?.thread_id;
          if (id && typeof id === 'string') {
            setThreadId(id);
            precreatedRef.current = true;
          }
        })
        .catch(() => {});
    } catch (_e) { /* ignore */ }
  }, [assistantId, effectiveTenantId, apiUrl, apiKey, idToken, threadId, setThreadId]);
  const internalStream = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    // Important: use global runs (threadId=null) so the SDK does not try to
    // GET/POST /threads/{db_id}/history on the LangGraph server, which doesn't
    // know about our DB thread IDs. We carry the DB thread id in our own SSE
    // channel and payload context instead.
    threadId: null,
    streamMode: ["messages"],
    defaultHeaders: {
      ...(effectiveTenantId ? { "X-Tenant-ID": effectiveTenantId } : {}),
      ...(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_AUTH_HEADER === 'true' && idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    onCustomEvent: (event, options) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
      // Auto-enqueue background job via FastAPI when graph emits a queue_job event
      try {
        const ev: any = event as any;
        if (ev && ev.type === "queue_job") {
          const tid = ev.tenant_id || effectiveTenantId;
          const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
          const base = useProxy ? "/api/backend" : (process.env.NEXT_PUBLIC_API_URL || "");
          fetch(`${base}/icp/enqueue/discovery-enrich`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(tid ? { "X-Tenant-ID": String(tid) } : {}),
            },
            body: JSON.stringify(ev.payload || {}),
          })
            .then(async (resp) => {
              const ok = resp.ok;
              let jobId: string | number | undefined = undefined;
              try {
                const data = await resp.json().catch(() => ({}));
                jobId = data?.job_id;
              } catch (_e) { /* ignore */ }
              // log outcome
              try {
                await fetch('/api/logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    level: ok ? 'info' : 'error',
                    component: 'queue_job',
                    message: ok ? 'Job enqueued' : 'Job enqueue failed',
                    data: { job_id: jobId, tenant_id: tid },
                    http: { status: resp.status },
                  }),
                });
              } catch (_err) { /* ignore */ }
              const msg = ok
                ? `Queued background discovery and enrichment${jobId ? ` (job ${jobId})` : ""}. I’ll reply here when it’s done.`
                : `I couldn’t queue the background job${resp.status ? ` (status ${resp.status})` : ""}. Please try again.`;
              options.mutate((prev) => ({
                ...prev,
                messages: [
                  ...(prev.messages ?? []),
                  { type: "ai", content: msg } as any,
                ],
              }));
            })
            .catch(() => {
              // log network error
              try {
                void fetch('/api/logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    level: 'error',
                    component: 'queue_job',
                    message: 'Network error enqueuing job',
                    data: { tenant_id: tid },
                  }),
                });
              } catch (_err2) { /* ignore */ }
              const msg = `I couldn’t queue the background job due to a network error. Please try again.`;
              options.mutate((prev) => ({
                ...prev,
                messages: [
                  ...(prev.messages ?? []),
                  { type: "ai", content: msg } as any,
                ],
              }));
            });
        }
      } catch (_err) { /* ignore */ }
    },
    onThreadId: (_id) => {
      // Ignore LangGraph in-memory thread ids; we keep DB thread id from FastAPI
      // Sidebar updates via GET /threads, not SDK callbacks
    },
  });

  useEffect(() => {
    // Avoid duplicate toasts/checks in React Strict Mode by persisting per-URL flag
    if (typeof window !== 'undefined') {
      try {
        const key = `lg:chat:connToast:${apiUrl}`;
        toastShownRef.current = window.sessionStorage.getItem(key) === '1';
      } catch (e) { void e; }
    }

    if (checkingRef.current) return;
    checkingRef.current = true;
    checkGraphStatus(apiUrl, apiKey, {
      idToken,
      tenantId: effectiveTenantId,
    })
      .then((ok) => {
        if (!ok && !toastShownRef.current) {
          toast.error("Failed to connect to LangGraph server", {
            description: () => (
              <p>
                Please ensure your graph is running at <code>{apiUrl}</code> and
                your API key is correctly set (if connecting to a deployed graph).
              </p>
            ),
            duration: 10000,
            richColors: true,
            closeButton: true,
          });
          toastShownRef.current = true;
      if (typeof window !== 'undefined') {
        try {
          const key = `lg:chat:connToast:${apiUrl}`;
          window.sessionStorage.setItem(key, '1');
        } catch (e) { void e; }
      }
        }
      })
      .finally(() => {
        checkingRef.current = false;
      });
  }, [apiKey, apiUrl, effectiveTenantId, idToken]);

  // Refresh sidebar when thread is created and after first AI message arrives
  const refreshOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId) return;
    getThreads().catch(() => undefined);
  }, [threadId, getThreads]);
  useEffect(() => {
    if (!threadId) return;
    try {
      const msgs = (internalStream as any)?.messages || [];
      const hasAI = Array.isArray(msgs) && msgs.some((m: any) => m?.type === 'ai');
      if (hasAI && refreshOnceRef.current !== threadId) {
        refreshOnceRef.current = threadId;
        getThreads().catch(() => undefined);
      }
    } catch (_e) { /* ignore */ }
  }, [internalStream, threadId, getThreads]);

  // Expose DB thread id in context, but keep LG runs global (threadId=null for SDK)
  const streamValue = React.useMemo(() => ({
    ...internalStream,
    threadId: threadId ?? null,
  }), [internalStream, threadId]);

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
// Align default assistant/graph id with the LangGraph dev server registration
// (see langgraph logs: Registering graph with id 'orchestrator').
const DEFAULT_ASSISTANT_ID = "orchestrator";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // For API key, use localStorage with env var fallback
  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  // Determine final values to use, prioritizing URL params then env vars
  const finalApiUrl = apiUrl || envApiUrl;
  const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
  // use absolute URL when proxying, to satisfy new URL() inside SDK
  const effectiveApiUrl = useProxy
    ? (typeof window !== 'undefined' ? new URL('/api', window.location.origin).toString() : finalApiUrl)
    : finalApiUrl;
  const finalAssistantId = assistantId || envAssistantId;

  // Show the form if we: don't have an API URL, or don't have an assistant ID
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground text-sm font-bold" aria-hidden>
                AC
              </span>
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to Agent Chat! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;
              const apiKey = formData.get("apiKey") as string;

              setApiUrl(apiUrl);
              setApiKey(apiKey);
              setAssistantId(assistantId);

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the graph (can be the graph name), or
                assistant to fetch threads from, and invoke when actions are
                taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={assistantId || DEFAULT_ASSISTANT_ID}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
              <PasswordInput
                id="apiKey"
                name="apiKey"
                defaultValue={apiKey ?? ""}
                className="bg-background"
                placeholder="lsv2_pt_..."
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
              >
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <StreamSession apiKey={apiKey} apiUrl={effectiveApiUrl!} assistantId={finalAssistantId!}>
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
