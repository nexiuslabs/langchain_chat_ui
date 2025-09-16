"use client";

import { useSession, signOut } from "next-auth/react";
import React, { useEffect, useMemo, useState } from "react";
import { useAuthFetch } from "@/lib/useAuthFetch";

export default function HeaderBar() {
  const { data: session } = useSession();
  const email = (session as any)?.user?.email as string | undefined;
  const tenantId = (session as any)?.tenantId as string | undefined;
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [tenantIdOverride, setTenantIdOverride] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [override, setOverride] = useState("");
  const [hasOverride, setHasOverride] = useState(false);
  const authFetch = useAuthFetch();
  const apiBase = useMemo(
    () =>
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:2024",
    []
  );
  const [verifying, setVerifying] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const idToken = (session as any)?.idToken as string | undefined;
  const issuerFromSession = (session as any)?.issuer as string | undefined;
  const nextauthUrlFromSession = (session as any)?.nextauthUrl as string | undefined;
  const clientIdFromSession = (session as any)?.clientId as string | undefined;

  useEffect(() => {
    const flag = (process.env.NEXT_PUBLIC_ENABLE_TENANT_SWITCHER || "").toLowerCase() === "true";
    setEnabled(flag);
    if (typeof window !== "undefined") {
      try {
        const v = window.localStorage.getItem("lg:chat:tenantId");
        if (v) {
          setOverride(v);
          setHasOverride(true);
        }
      } catch {}
    }
  }, []);

  // Fallback identity when NextAuth session is not set (cookie login path)
  useEffect(() => {
    let cancelled = false;
    if (email) {
      setEmailOverride(null);
      return;
    }
    (async () => {
      try {
        // Try strict whoami first
        let res = await authFetch(`${apiBase}/whoami`);
        if (!res.ok) {
          // Fallback to optional identity to get email when tenant_id claim is missing
          res = await authFetch(`${apiBase}/session/odoo_info`);
        }
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        const em = j?.email || j?.user?.email;
        const tid = j?.tenant_id ?? (j?.odoo?.tenant_id ?? null);
        if (em) setEmailOverride(String(em));
        if (tid != null) setTenantIdOverride(String(tid));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [email, apiBase, authFetch]);

  // No backlog badge polling

  const applyOverride = () => {
    try {
      if (override) {
        window.localStorage.setItem("lg:chat:tenantId", override);
        window.location.reload();
      }
    } catch {}
  };
  const clearOverride = () => {
    try {
      window.localStorage.removeItem("lg:chat:tenantId");
      window.location.reload();
    } catch {}
  };

  const verifyOdoo = async () => {
    setVerifying(true);
    setVerifyNote(null);
    try {
      const res = await authFetch(`${apiBase}/onboarding/verify_odoo`);
      const body = await res.json();
      if (body.ready) setVerifyNote("Odoo: ready (mapping exists, smoke passed)");
      else if (body.exists && !body.smoke) setVerifyNote(`Odoo: mapping exists, smoke failed${body.error ? ": "+body.error : ""}`);
      else setVerifyNote(`Odoo: not ready${body.error ? ": "+body.error : ""}`);
    } catch (e: any) {
      setVerifyNote(`Odoo verify error: ${String(e)}`);
    } finally {
      setVerifying(false);
    }
  };

  const globalSignOut = async () => {
    try {
      // Clear NextAuth session cookie without redirecting yet
      await signOut({ redirect: false });
    } catch {}
    try {
      const issuer = issuerFromSession || process.env.NEXT_PUBLIC_NEXIUS_ISSUER || "";
      const base = issuer.replace(/\/+$/, "");
      const origin = nextauthUrlFromSession || (typeof window !== 'undefined' ? window.location.origin : "");
      // Send users back to the exact allowed URL in Keycloak.
      // Use explicit env override if set; otherwise use origin (no trailing slash).
      const postLogout = (process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || origin).replace(/\/$/, "");
      const qp = new URLSearchParams({ post_logout_redirect_uri: postLogout });
      if (idToken) qp.set("id_token_hint", idToken);
      // Include client_id for broader Keycloak compatibility
      const clientId = clientIdFromSession || process.env.NEXT_PUBLIC_NEXIUS_CLIENT_ID || process.env.NEXIUS_CLIENT_ID || "";
      if (clientId) qp.set("client_id", clientId);
      const logoutUrl = `${base}/protocol/openid-connect/logout?${qp.toString()}`;
      if (logoutUrl.startsWith("http")) {
        window.location.href = logoutUrl;
        return;
      }
    } catch {}
    // Fallback: go to our custom login page
    window.location.href = "/login";
  };

  return (
    <div className="w-full border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-3 justify-between">
        <div className="text-sm text-muted-foreground truncate">
          {(email || emailOverride) ? (
            <span>
              Signed in as <span className="font-medium text-foreground">{email || emailOverride}</span>
              {" "+((tenantId || tenantIdOverride) ? `(tenant: ${tenantId || tenantIdOverride}${hasOverride ? ", override" : ""})` : "")}
            </span>
          ) : (
            <span>Authenticating…</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            className="text-sm px-2 py-1 border rounded"
            onClick={verifyOdoo}
            disabled={verifying}
            title="Verify Odoo connectivity for your tenant"
          >
            {verifying ? "Verifying…" : "Verify Odoo"}
          </button>
          {verifyNote && (
            <span className="text-xs text-muted-foreground">{verifyNote}</span>
          )}
          {enabled && (
            <div className="flex items-center gap-2">
              <input
                className="px-2 py-1 border rounded text-sm"
                placeholder="tenant override"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
              <button className="text-sm px-2 py-1 border rounded" onClick={applyOverride}>
                Use
              </button>
              {hasOverride && (
                <button className="text-sm px-2 py-1 border rounded" onClick={clearOverride}>
                  Clear
                </button>
              )}
            </div>
          )}
          <button
            className="text-sm px-2 py-1 border rounded"
            onClick={globalSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
