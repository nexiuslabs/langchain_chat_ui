import { Thread } from "@langchain/langgraph-sdk";

export type TenantThreadCache = Map<string, Thread[]>;

export function scopeThreadsToTenant(threads: Thread[], tenantId: string): Thread[] {
  return threads.filter((thread) => thread.metadata?.tenant_id === tenantId);
}

export function mergeThreadLists(existing: Thread[], incoming: Thread[]): Thread[] {
  const seen = new Set<string>();
  const merged: Thread[] = [];

  for (const thread of incoming) {
    if (!seen.has(thread.thread_id)) {
      merged.push(thread);
      seen.add(thread.thread_id);
    }
  }

  for (const thread of existing) {
    if (!seen.has(thread.thread_id)) {
      merged.push(thread);
      seen.add(thread.thread_id);
    }
  }

  return merged;
}

export function writeTenantThreads(
  cache: TenantThreadCache,
  tenantId: string,
  threads: Thread[],
): TenantThreadCache {
  const scoped = scopeThreadsToTenant(threads, tenantId);
  const next = new Map(cache);
  next.set(tenantId, scoped);
  return next;
}

export function readTenantThreads(
  cache: TenantThreadCache,
  tenantId: string,
): Thread[] {
  return cache.get(tenantId) ?? [];
}

export function mergeTenantThreadsIntoCache(
  cache: TenantThreadCache,
  tenantId: string,
  incoming: Thread[],
): TenantThreadCache {
  const scopedIncoming = scopeThreadsToTenant(incoming, tenantId);
  const existing = cache.get(tenantId) ?? [];
  const merged = mergeThreadLists(existing, scopedIncoming);
  const next = new Map(cache);
  next.set(tenantId, merged);
  return next;
}
