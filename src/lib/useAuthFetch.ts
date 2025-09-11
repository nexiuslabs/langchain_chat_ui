"use client";

import { useSession, signIn } from "next-auth/react";

export function useAuthFetch() {
  const { data: session } = useSession();
  const idToken = (session as any)?.idToken as string | undefined;
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  const enabled = (process.env.NEXT_PUBLIC_ENABLE_TENANT_SWITCHER || "").toLowerCase() === "true";

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
    // Proxy to /api to keep same-origin cookies when enabled
    let target: RequestInfo | URL = input;
    try {
      const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === "true";
      const base = process.env.NEXT_PUBLIC_API_URL || "";
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (useProxy && base && url.startsWith(base)) {
        const u = new URL(url);
        target = "/api/backend" + u.pathname + (u.search || "");
      }
    } catch {}

    const res = await fetch(target, { ...init, headers, credentials: "include" });
    if (res.status === 401) {
      // In production cookie-mode, send user to cookie login page
      if (process.env.NODE_ENV === 'production' || (process.env.NEXT_PUBLIC_USE_AUTH_HEADER || '').toLowerCase() !== 'true') {
        if (typeof window !== 'undefined') window.location.href = "/login";
      } else {
        // Dev: optionally allow SSO re-auth via NextAuth if enabled
        void signIn(undefined, { callbackUrl: "/" });
      }
    }
    return res;
  };
}
