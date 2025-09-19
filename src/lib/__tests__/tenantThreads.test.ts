import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Thread } from "@langchain/langgraph-sdk";

import {
  mergeThreadLists,
  readTenantThreads,
  writeTenantThreads,
} from "../threadTenants.js";

const makeThread = (
  threadId: string,
  tenantId: string,
  extra?: Partial<Thread>,
): Thread =>
  ({
    thread_id: threadId,
    metadata: { tenant_id: tenantId },
    ...extra,
  } as unknown as Thread);

describe("tenant thread cache", () => {
  it("isolates tenant-specific thread lists when switching between tenants", () => {
    const cache = new Map<string, Thread[]>();

    const tenantAThreads: Thread[] = [
      makeThread("tenant-a-thread-1", "tenant-a"),
      makeThread("tenant-b-thread-should-be-filtered", "tenant-b"),
    ];

    const afterTenantA = writeTenantThreads(cache, "tenant-a", tenantAThreads);
    assert.deepEqual(
      readTenantThreads(afterTenantA, "tenant-a").map((thread) => thread.thread_id),
      ["tenant-a-thread-1"],
    );
    assert.equal(readTenantThreads(afterTenantA, "tenant-b").length, 0);

    const tenantBThreads: Thread[] = [
      makeThread("tenant-b-thread-1", "tenant-b"),
      makeThread("tenant-a-thread-should-be-filtered", "tenant-a"),
    ];

    const afterTenantB = writeTenantThreads(afterTenantA, "tenant-b", tenantBThreads);
    assert.deepEqual(
      readTenantThreads(afterTenantB, "tenant-a").map((thread) => thread.thread_id),
      ["tenant-a-thread-1"],
    );
    assert.deepEqual(
      readTenantThreads(afterTenantB, "tenant-b").map((thread) => thread.thread_id),
      ["tenant-b-thread-1"],
    );
  });

  it("prefers latest thread payloads while keeping older tenant entries", () => {
    const existing: Thread[] = [
      makeThread("shared-thread", "tenant-a", { values: { version: "old" } }),
      makeThread("legacy-thread", "tenant-a"),
    ];

    const incoming: Thread[] = [
      makeThread("shared-thread", "tenant-a", { values: { version: "new" } }),
      makeThread("fresh-thread", "tenant-a"),
    ];

    const merged = mergeThreadLists(existing, incoming);
    assert.deepEqual(
      merged.map((thread) => thread.thread_id),
      ["shared-thread", "fresh-thread", "legacy-thread"],
    );
    assert.equal((merged[0] as any).values?.version, "new");
  });
});
