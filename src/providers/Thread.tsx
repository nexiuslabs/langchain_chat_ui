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
  const effectiveTenantId = (() => {
    // Prefer explicit override in localStorage when present (set after cookie login)
    try {
      if (typeof window !== 'undefined') {
        const v = window.localStorage.getItem('lg:chat:tenantId');
        if (v) return v;
      }
    } catch (e) { void e; }
    return sessionTenantId;
  })();

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
    if (!apiUrl || !assistantId || !effectiveTenantId) return [];
    const defaultHeaders = effectiveTenantId ? { "X-Tenant-ID": effectiveTenantId } : undefined;
    const client = createClient(clientBase, getApiKey() ?? undefined, defaultHeaders);

    // Important: assistant/graph identifier must be top-level filters, not in metadata
    const idFilter = getThreadSearchMetadata(assistantId);
    const threads = await client.threads.search({
      ...idFilter,
      metadata: {
        ...(effectiveTenantId ? { tenant_id: effectiveTenantId } : {}),
      },
      limit: 100,
    });

    const scopedThreads = scopeThreadsToTenant(threads, effectiveTenantId);
    setTenantThreads((prev) => writeTenantThreads(prev, effectiveTenantId, scopedThreads));
    return scopedThreads;
  }, [apiUrl, assistantId, clientBase, effectiveTenantId]);

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
