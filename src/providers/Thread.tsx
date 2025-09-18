import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useState,
  Dispatch,
  SetStateAction,
} from "react";
import { createClient } from "./client";
import { useSession } from "next-auth/react";

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
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const { data: session } = useSession();
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  const effectiveTenantId = (() => {
    try {
      const enabled = (process.env.NEXT_PUBLIC_ENABLE_TENANT_SWITCHER || "").toLowerCase() === "true";
      if (enabled && typeof window !== 'undefined') {
        const v = window.localStorage.getItem('lg:chat:tenantId');
        if (v) return v;
      }
    } catch {}
    return sessionTenantId;
  })();

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    if (!apiUrl || !assistantId) return [];
    const defaultHeaders = effectiveTenantId ? { "X-Tenant-ID": effectiveTenantId } : undefined;
    const client = createClient(clientBase, getApiKey() ?? undefined, defaultHeaders);

    const threads = await client.threads.search({
      metadata: {
        ...getThreadSearchMetadata(assistantId),
        ...(effectiveTenantId ? { tenant_id: effectiveTenantId } : {}),
      },
      limit: 100,
    });

    return threads;
  }, [clientBase, assistantId, effectiveTenantId]);

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
