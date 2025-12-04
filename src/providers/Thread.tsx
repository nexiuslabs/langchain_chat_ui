import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useMemo,
  useState,
  Dispatch,
  SetStateAction,
} from "react";
import { createClient } from "./client";
import { useSession } from "next-auth/react";
import {
  readTenantThreads,
  scopeThreadsToTenant,
  writeTenantThreads,
} from "@/lib/threadTenants";
import { useTenant } from "@/providers/Tenant";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

function getThreadSearchMetadata(
  assistantId: string,
): { graph_id: string } | { assistant_id: string } {
  if (validate(assistantId)) {
    return { assistant_id: assistantId };
  } else {
    return { graph_id: assistantId };
  }
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [apiUrlQ] = useQueryState("apiUrl");
  const [assistantIdQ] = useQueryState("assistantId");
  const apiUrl = apiUrlQ || (process.env.NEXT_PUBLIC_API_URL || "");
  // Route via Next.js proxy to include cookies in dev when enabled
  const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
  const clientBase = useProxy
    ? (typeof window !== 'undefined' ? new URL('/api', window.location.origin).toString() : apiUrl)
    : apiUrl;
  const assistantId = assistantIdQ || (process.env.NEXT_PUBLIC_ASSISTANT_ID || "");
  const [tenantThreads, setTenantThreads] = useState<Map<string, Thread[]>>(
    () => new Map(),
  );
  const [threadsLoading, setThreadsLoading] = useState(false);
  const { data: session } = useSession();
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  const { tenantId: storedTenantId } = useTenant();
  const effectiveTenantId = storedTenantId || sessionTenantId || null;

  const threads = useMemo(() => {
    // Fallback bucket when tenant is unknown so current thread can still show
    const key = effectiveTenantId || "__default__";
    if (!effectiveTenantId) {
      return tenantThreads.get(key) ?? [];
    }
    return readTenantThreads(tenantThreads, effectiveTenantId);
  }, [tenantThreads, effectiveTenantId]);

  const setThreads = useCallback(
    (value: SetStateAction<Thread[]>) => {
      setTenantThreads((prev) => {
        if (!effectiveTenantId) {
          // Write into fallback bucket without tenant scoping
          const key = "__default__";
          const current = prev.get(key) ?? [];
          const nextList =
            typeof value === "function"
              ? (value as (prevState: Thread[]) => Thread[])(current)
              : value;
          const next = new Map(prev);
          next.set(key, nextList);
          return next;
        }
        const current = readTenantThreads(prev, effectiveTenantId);
        const nextList =
          typeof value === "function"
            ? (value as (prevState: Thread[]) => Thread[])(current)
            : value;
        const scopedNext = scopeThreadsToTenant(nextList, effectiveTenantId);
        return writeTenantThreads(prev, effectiveTenantId, scopedNext);
      });
    },
    [effectiveTenantId],
  );

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    // Enforce tenant isolation: do not fetch when tenant is unknown
    if (!effectiveTenantId) return [];

    // Prefer FastAPI DB-backed threads so titles/labels persist
    const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
    const base = useProxy
      ? "/api/backend"
      : ((process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || ""));
    const url = `${(base || "").replace(/\/$/, "")}/threads`;
    const headers: Record<string, string> = { "accept": "application/json" };
    headers["X-Tenant-ID"] = String(effectiveTenantId);
    const resp = await fetch(url, { method: "GET", headers, credentials: "include" });
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json().catch(() => ({ items: [] }));
    const items = Array.isArray(data?.items) ? data.items : [];

    // Map FastAPI rows → minimal LangGraph Thread objects expected by UI
    const mapped: Thread[] = items.map((row: any) => {
      const threadId = String(row?.id || "");
      const label = (row?.label || row?.context_key || threadId || "").toString();
      return {
        thread_id: threadId,
        created_at: row?.created_at || null,
        updated_at: row?.last_updated_at || row?.created_at || null,
        // Minimal values shape so ThreadList can render a title using first message content
        values: {
          messages: [
            {
              id: "t-" + threadId,
              role: "assistant",
              content: [{ type: "text", text: label }],
            },
          ],
        },
        // Include tenant id so scopeThreadsToTenant can filter correctly
        metadata: { tenant_id: String(effectiveTenantId) },
      } as unknown as Thread;
    });

    const scopedThreads = scopeThreadsToTenant(mapped, effectiveTenantId);
    setTenantThreads((prev) => writeTenantThreads(prev, effectiveTenantId, scopedThreads));
    return scopedThreads;
  }, [effectiveTenantId]);

  const value = {
    getThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
