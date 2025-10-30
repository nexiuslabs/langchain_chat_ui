"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthFetch } from "@/lib/useAuthFetch";

function useConnectionStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || '').toLowerCase() === 'true';
    const apiUrl = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('apiUrl')
      || (process.env.NEXT_PUBLIC_API_URL || '');
    async function check() {
      try {
        const infoUrl = useProxy ? '/api/info' : `${apiUrl}/info`;
        const altUrl  = useProxy ? '/api/assistants?limit=1' : `${apiUrl}/assistants?limit=1`;
        const r1 = await fetch(infoUrl, { credentials: 'include' });
        if (cancelled) return;
        if (r1.ok || [401,403,404,405].includes(r1.status)) { setOk(true); return; }
        const r2 = await fetch(altUrl, { credentials: 'include' });
        if (!cancelled) setOk(r2.ok || [401,403,404,405].includes(r2.status));
      } catch {
        if (!cancelled) setOk(false);
      }
    }
    void check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return ok;
}

function ConnectionBadge() {
  const ok = useConnectionStatus();
  if (ok === null) return null;
  return (
    <span className={"text-xs px-2 py-1 rounded " + (ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")} title={ok ? 'Connection healthy' : 'Connection failed'}>
      {ok ? 'Connected' : 'Offline'}
    </span>
  );
}

function ExportButtons({ apiBase, authFetch }: { apiBase: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  async function dl(path: string, filename: string) {
    const res = await authFetch(`${apiBase}${path}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => dl(`/export/latest_scores.csv?limit=500`, `shortlist.csv`)} aria-label="Download latest shortlist as CSV">CSV</Button>
      <Button variant="outline" size="sm" onClick={() => dl(`/export/latest_scores.json?limit=500`, `shortlist.json`)} aria-label="Download latest shortlist as JSON">JSON</Button>
    </div>
  );
}

function VerifyOdoo({ apiBase, authFetch }: { apiBase: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const onVerify = async () => {
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
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onVerify} disabled={verifying} aria-busy={verifying} aria-label="Verify Odoo connectivity">
        {verifying ? "Verifying…" : "Verify Odoo"}
      </Button>
      {verifyNote && <p className="text-xs text-muted-foreground" role="status">{verifyNote}</p>}
    </div>
  );
}

function TenantOverride({ enabled, apiBase, authFetch }: { enabled: boolean; apiBase: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  const [override, setOverride] = useState("");
  const [hasOverride, setHasOverride] = useState(false);
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const v = window.localStorage.getItem("lg:chat:tenantId");
        if (v) { setOverride(v); setHasOverride(true); }
      }
    } catch { /* noop */ }
  }, []);
  if (!enabled) return null;
  return (
    <div className="grid gap-2">
      <Label htmlFor="tenantOverride">Tenant override</Label>
      <div className="flex gap-2 items-end">
        <Input id="tenantOverride" className="flex-1" placeholder="tenant override" value={override} onChange={(e) => setOverride(e.target.value)} />
        <Button variant="secondary" onClick={() => { try { window.localStorage.setItem("lg:chat:tenantId", override); window.location.reload(); } catch {} }}>Use</Button>
        {hasOverride && (
          <Button variant="destructive" onClick={() => { try { window.localStorage.removeItem("lg:chat:tenantId"); window.location.reload(); } catch {} }}>Clear</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Overrides current tenant for thread-scoped operations.</p>
    </div>
  );
}

export function AppShell(): React.ReactNode {
  const pathname = usePathname();
  const { data: session } = useSession();
  const email = (session as any)?.user?.email as string | undefined;
  const sessionTenantId = (session as any)?.tenantId as string | undefined;
  const [emailFallback, setEmailFallback] = useState<string | null>(null);
  const [tenantIdOverride, setTenantIdOverride] = useState<string | null>(null);
  const authFetch = useAuthFetch();
  const apiBase = useMemo(
    () =>
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:2024",
    []
  );
  const idToken = (session as any)?.idToken as string | undefined;
  const issuerFromSession = (session as any)?.issuer as string | undefined;
  const nextauthUrlFromSession = (session as any)?.nextauthUrl as string | undefined;
  const clientIdFromSession = (session as any)?.clientId as string | undefined;

  const globalSignOut = async () => {
    try { await signOut({ redirect: false }); } catch {}
    try { if (typeof window !== 'undefined') window.localStorage.removeItem('lg:chat:tenantId'); } catch {}
    try {
      const issuer = issuerFromSession || process.env.NEXT_PUBLIC_NEXIUS_ISSUER || "";
      const base = issuer.replace(/\/+$/, "");
      const origin = nextauthUrlFromSession || (typeof window !== 'undefined' ? window.location.origin : "");
      const postLogout = (process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || origin).replace(/\/$/, "");
      const qp = new URLSearchParams({ post_logout_redirect_uri: postLogout });
      if (idToken) qp.set("id_token_hint", idToken);
      const clientId = clientIdFromSession || process.env.NEXT_PUBLIC_NEXIUS_CLIENT_ID || process.env.NEXIUS_CLIENT_ID || "";
      if (clientId) qp.set("client_id", clientId);
      const logoutUrl = `${base}/protocol/openid-connect/logout?${qp.toString()}`;
      if (logoutUrl.startsWith("http")) { window.location.href = logoutUrl; return; }
    } catch {}
    window.location.href = "/login";
  };

  const enableTenantSwitcher = (process.env.NEXT_PUBLIC_ENABLE_TENANT_SWITCHER || "").toLowerCase() === "true";

  // Fallback identity when NextAuth session is not set (cookie login path)
  useEffect(() => {
    let cancelled = false;
    if (email) {
      setEmailFallback(null);
      return;
    }
    (async () => {
      try {
        // Try strict whoami first
        let res = await authFetch(`${apiBase}/whoami`);
        if (!res.ok) {
          // Fallback to optional identity when tenant claim is missing
          res = await authFetch(`${apiBase}/session/odoo_info`);
        }
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        const em = j?.email || j?.user?.email;
        const tid = j?.tenant_id ?? (j?.odoo?.tenant_id ?? null);
        if (em) setEmailFallback(String(em));
        if (tid != null) {
          const tidStr = String(tid);
          setTenantIdOverride(tidStr);
          try {
            if (typeof window !== 'undefined' && !window.localStorage.getItem('lg:chat:tenantId')) {
              window.localStorage.setItem('lg:chat:tenantId', tidStr);
            }
          } catch (e) { void e; }
        }
      } catch (e) { void e; }
    })();
    return () => { cancelled = true; };
  }, [email, apiBase, authFetch]);

  // Initialize tenant override from localStorage (for cookie-login or persisted override)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const v = window.localStorage.getItem('lg:chat:tenantId');
        if (v) setTenantIdOverride(v);
      }
    } catch (e) { void e; }
  }, []);

  return (
    <div className="w-full bg-brand-navy text-white">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Go to chat home" className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">Agent Chat</span>
          </Link>
          <nav aria-label="Primary" className="hidden sm:flex items-center gap-1">
            {[
              { href: "/", label: "Chat" },
              { href: "/candidates", label: "Candidates" },
              { href: "/metrics", label: "Metrics" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={`text-sm px-3 py-1 rounded border ${
                  pathname === href
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "text-white/90 border-white/20 hover:bg-white/10"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" aria-haspopup="dialog" aria-expanded={undefined}>Advanced</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
              <SheetHeader>
                <SheetTitle>Advanced controls</SheetTitle>
              </SheetHeader>
              <div className="grid gap-4 py-4 px-4">
                <div className="grid gap-1">
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium break-all text-foreground">{email || emailFallback || "Authenticating…"}</p>
                  { (sessionTenantId || tenantIdOverride) && (
                    <p className="text-xs text-muted-foreground">Tenant: <span className="text-foreground">{sessionTenantId || tenantIdOverride}</span></p>
                  )}
                </div>
                <Separator />
                <div className="grid gap-2" aria-label="Export data">
                  <p className="text-sm font-medium">Export</p>
                  <ExportButtons apiBase={apiBase} authFetch={authFetch} />
                  <p className="text-xs text-muted-foreground">Download latest shortlist as CSV or JSON.</p>
                </div>
                <Separator />
                <div className="grid gap-2" aria-label="Verify Odoo connectivity">
                  <p className="text-sm font-medium">Odoo</p>
                  <VerifyOdoo apiBase={apiBase} authFetch={authFetch} />
                </div>
                <Separator />
                <TenantOverride enabled={enableTenantSwitcher} apiBase={apiBase} authFetch={authFetch} />
                <Separator />
                <div className="flex justify-end items-center">
                  <Button variant="destructive" onClick={globalSignOut}>Sign out</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
