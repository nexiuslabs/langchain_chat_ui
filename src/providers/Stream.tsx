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
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey } from "@/lib/api-key";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { mergeThreadLists } from "@/lib/threadTenants";
import { createClient } from "./client";

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
  const [tenantOverride, setTenantOverride] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const toastShownRef = useRef(false);
  // Read tenant override from localStorage when present (supports cookie-login scenario)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem('lg:chat:tenantId');
      if (v) setTenantOverride(v);
    } catch (e) { void e; }
  }, []);
  const effectiveTenantId = tenantOverride || sessionTenantId;
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();

  // Pre-create a tenant-scoped thread to ensure metadata is attached
  const precreatedRef = useRef(false);
  useEffect(() => {
    if (precreatedRef.current) return;
    if (threadId) return; // already have a thread
    if (!assistantId) return;
    // Require tenant id to avoid cross-tenant ambiguity
    if (!effectiveTenantId) return;
    try {
      const client = createClient(apiUrl, apiKey ?? undefined, {
        ...(effectiveTenantId ? { "X-Tenant-ID": effectiveTenantId } : {}),
        ...(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_AUTH_HEADER === 'true' && idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      });
      client.threads
        .create({ metadata: { tenant_id: effectiveTenantId }, graphId: assistantId })
        .then((t) => {
          setThreadId(t.thread_id);
          precreatedRef.current = true;
        })
        .catch((e) => { void e; });
    } catch (e) { void e; }
  }, [assistantId, effectiveTenantId, apiUrl, apiKey, idToken, threadId, setThreadId]);
  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    threadId: threadId ?? null,
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
    },
    onThreadId: (id) => {
      setThreadId(id);
      // Optimistically add the new thread to history so the sidebar updates immediately
      try {
        setThreads((existing) => mergeThreadLists(existing, [{ thread_id: id } as any]));
      } catch (e) { void e; }
      // Ensure thread carries tenant metadata even if auto-created by the SDK
      (async () => {
        try {
          if (!effectiveTenantId) return;
          const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
          const base = useProxy ? "/api" : apiUrl;
          const res = await fetch(`${base}/threads/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(effectiveTenantId ? { "X-Tenant-ID": effectiveTenantId } : {}),
              ...(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_AUTH_HEADER === 'true' && idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify({ metadata: { tenant_id: effectiveTenantId } }),
          });
          // ignore non-2xx; it's a best-effort
        } catch (e) { void e; }
      })();
      // Refetch threads list when thread ID changes.
      // Wait for some seconds before fetching so we're able to get the new thread that was created.
      sleep()
        .then(() =>
          getThreads().then((fetched) =>
            setThreads((existing) => mergeThreadLists(existing, fetched)),
          ),
        )
        .catch(console.error);
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

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = "agent";

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
              <LangGraphLogoSVG className="h-7" />
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
