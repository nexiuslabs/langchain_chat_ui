"use client";

import { useSession, signIn } from "next-auth/react";

export function useAuthFetch() {
  const { data: session } = useSession();
  const idToken = (session as any)?.idToken as string | undefined;
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  const enabled = (process.env.NEXT_PUBLIC_ENABLE_TENANT_SWITCHER || "").toLowerCase() === "true";
  // Prevent infinite refresh loops on persistent 401s
  let didRefresh = false;

  function tenantOverride(): string | undefined {
    if (!enabled) return sessionTenantId;
    try {
      const v = window.localStorage.getItem("lg:chat:tenantId");
      return v || sessionTenantId;
    } catch {
      return sessionTenantId;
    }
  }

  return async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    const tid = tenantOverride();
    // Only allow Authorization header in development when explicitly enabled
    const allowAuthHeader = process.env.NODE_ENV !== "production" && (process.env.NEXT_PUBLIC_USE_AUTH_HEADER || "").toLowerCase() === "true";
    if (allowAuthHeader && idToken) headers.set("Authorization", `Bearer ${idToken}`);
    if (tid) headers.set("X-Tenant-ID", tid);
    // Compute request URL and bases
    let target: RequestInfo | URL = input;
    const urlStr = typeof input === 'string' ? input : (input as URL).toString();
    const apiUrlEnv = process.env.NEXT_PUBLIC_API_URL || '';
    const apiBaseEnv = process.env.NEXT_PUBLIC_API_BASE || '';
    const isAbs = /^https?:\/\//i.test(urlStr);
    const targetBase = isAbs
      ? (urlStr.startsWith(apiUrlEnv) ? apiUrlEnv : (urlStr.startsWith(apiBaseEnv) ? apiBaseEnv : ''))
      : '';
    const isLangGraph = targetBase && targetBase === apiUrlEnv;
    const isBackend = targetBase && targetBase === apiBaseEnv;
    // Proxy to /api/backend ONLY for LangGraph calls when enabled
    try {
      const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
      if (useProxy && isLangGraph) {
        const u = new URL(urlStr);
        target = "/api/backend" + u.pathname + (u.search || "");
      }
    } catch {}

    const doFetch = async () => fetch(target, { ...init, headers, credentials: "include" });
    let res = await doFetch();
    if (res.status !== 401) return res;
    // Attempt silent cookie refresh once (backend), then retry the original request
    const useAuthHeader = (process.env.NEXT_PUBLIC_USE_AUTH_HEADER || '').toLowerCase() === 'true';
    if (!didRefresh && !useAuthHeader) {
      try {
        // Prefer backend base for refresh if configured, otherwise fall back to request's base
        const refreshBase = (process.env.NEXT_PUBLIC_API_BASE || '') || (targetBase || apiUrlEnv || "");
        const refreshUrl = `${refreshBase.replace(/\/$/, '')}/auth/refresh`;
        const r = await fetch(refreshUrl, { method: 'POST', credentials: 'include' });
        didRefresh = true;
        if (r.ok) {
          res = await doFetch();
          if (res.status !== 401) return res;
        }
      } catch {}
    }
    // Fall back to interactive flows
    if (process.env.NODE_ENV === 'production' || !useAuthHeader) {
      if (typeof window !== 'undefined') window.location.href = "/login";
    } else {
      void signIn(undefined, { callbackUrl: "/" });
    }
    return res;
  };
}
