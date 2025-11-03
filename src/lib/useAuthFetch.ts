"use client";

import { useSession, signIn } from "next-auth/react";

export function useAuthFetch() {
  const { data: session } = useSession();
  const idToken = (session as any)?.idToken as string | undefined;
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  // Prevent infinite refresh loops on persistent 401s
  let didRefresh = false;

  function hasCookie(name: string): boolean {
    try {
      if (typeof document === "undefined") return false;
      const cookies = document.cookie ? document.cookie.split(";") : [];
      const n = name + "=";
      for (const c of cookies) {
        if (c.trim().startsWith(n)) return true;
      }
      return false;
    } catch (_err) {
      return false;
    }
  }

  function tenantOverride(): string | undefined {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem("lg:chat:tenantId") : null;
      return v || sessionTenantId;
    } catch (e) {
      void e;
      return sessionTenantId;
    }
  }

  return async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    const tid = tenantOverride();
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
    // Prefer cookie-mode auth for LangGraph to allow /auth/refresh to rotate cookies mid-stream
    const hasAccessCookie = hasCookie(process.env.NEXT_PUBLIC_ACCESS_COOKIE_NAME || "nx_access");
    // Include Authorization header unless we're calling LangGraph and already have an nx_access cookie
    if (!(isLangGraph && hasAccessCookie) && idToken) {
      headers.set("Authorization", `Bearer ${idToken}`);
    }
    if (tid) headers.set("X-Tenant-ID", tid);
    // Proxy to /api/backend ONLY for LangGraph calls when enabled
    try {
      const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
      if (useProxy && isLangGraph) {
        const u = new URL(urlStr);
        target = "/api/backend" + u.pathname + (u.search || "");
      }
    } catch (e) { void e; }

    const doFetch = async () => fetch(target, { ...init, headers, credentials: "include" });
    let res = await doFetch();
    if (res.status !== 401) return res;
    // Attempt silent cookie refresh once (backend), then retry the original request
    // If Authorization header is already present, refresh is likely unnecessary;
    // still try once to be resilient in mixed cookie/header setups.
    if (!didRefresh) {
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
      } catch (e) { void e; }
    }
    // Fall back to interactive flows
    if (process.env.NODE_ENV === 'production') {
      if (typeof window !== 'undefined') window.location.href = "/login";
    } else {
      void signIn(undefined, { callbackUrl: "/" });
    }
    return res;
  };
}
