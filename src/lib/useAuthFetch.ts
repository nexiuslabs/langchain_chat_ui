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
    if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
    if (tid) headers.set("X-Tenant-ID", tid);
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401) {
      // Token invalid/expired → retry via SSO
      void signIn(undefined, { callbackUrl: "/" });
    }
    return res;
  };
}

