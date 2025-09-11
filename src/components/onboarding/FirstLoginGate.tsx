"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
// Note: do not rely on NextAuth session for cookie-based onboarding
import { useAuthFetch } from "@/lib/useAuthFetch";

type Status = "unknown" | "provisioning" | "syncing" | "ready" | "error";

export function FirstLoginGate({ children }: { children: React.ReactNode }) {
  const apiBase = useMemo(
    () =>
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:2024",
    []
  );
  const authFetch = useAuthFetch();
  const [state, setState] = useState<{ status: Status; error?: string }>({ status: "unknown" });
  const [enabled, setEnabled] = useState(false);
  const bootRef = useRef(false);

  // Kick off onboarding once (sets enabled=true when request is accepted)
  useEffect(() => {
    let cancelled = false;
    if (bootRef.current) return;

    async function kickOff() {
      try {
        const res = await authFetch(`${apiBase}/onboarding/first_login`, { method: "POST" });
        if (res.status === 401) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (!cancelled) {
          setEnabled(true);
          const initial = (body.status as Status) || "provisioning";
          setState({ status: initial });
          // Fast-pass: if Odoo is already ready, unlock immediately
          try {
            const r2 = await authFetch(`${apiBase}/session/odoo_info`);
            if (r2.ok) {
              const j = await r2.json();
              if (j?.odoo?.ready) {
                setState({ status: "ready" });
                return;
              }
            }
          } catch {}
          // Secondary fast-pass: verify_odoo endpoint
          try {
            const r3 = await authFetch(`${apiBase}/onboarding/verify_odoo`);
            if (r3.ok) {
              const v = await r3.json();
              if (v?.ready === true) {
                setState({ status: "ready" });
                return;
              }
            }
          } catch {}
        }
      } catch (e: any) {
        if (!cancelled) setState({ status: "error", error: String(e) });
      }
    }
    kickOff();
    bootRef.current = true;

    return () => {
      cancelled = true;
    };
  }, [apiBase, authFetch]);

  // Poll status only after enabled=true
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let iv: any;

    async function pollOnce() {
      try {
        const res = await authFetch(`${apiBase}/onboarding/status`);
        if (res.status === 401) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const body = await res.json();
        if (!cancelled) {
          const raw = (body?.status as string) || "provisioning";
          const norm = raw === "complete" ? "ready" : raw;
          const allowed: Status[] = ["provisioning", "syncing", "ready", "error"];
          const st = (allowed as string[]).includes(norm) ? (norm as Status) : "provisioning";
          if (st !== "ready") {
            try {
              const v = await authFetch(`${apiBase}/onboarding/verify_odoo`);
              if (v.ok) {
                const j = await v.json();
                if (j?.ready === true) {
                  setState({ status: "ready" });
                  return;
                }
              }
            } catch {}
          }
          setState({ status: st, error: body?.error });
        }
      } catch (e: any) {
        if (!cancelled) setState({ status: "error", error: String(e) });
      }
    }

    // immediate first poll then interval
    void pollOnce();
    iv = setInterval(pollOnce, 2000);

    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [enabled, apiBase, authFetch]);

  // Extra safety: on mount, try a quick Odoo readiness probe even before enabled flips
  useEffect(() => {
    let cancelled = false;
    let iv: any;
    async function probe() {
      try {
        const r = await authFetch(`${apiBase}/session/odoo_info`);
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && j?.odoo?.ready) {
          setState({ status: "ready" });
        }
      } catch {}
    }
    // Try once immediately, then every 2s for up to ~10s
    void probe();
    let count = 0;
    iv = setInterval(() => {
      if (count++ >= 5) {
        clearInterval(iv);
        return;
      }
      void probe();
    }, 2000);
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [apiBase, authFetch]);
  if (state.status === "ready") return <>{children}</>;

  return (
    <div className="w-full h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-lg font-medium">Setting up your workspace…</div>
        <div className="text-sm text-muted-foreground">
          {state.status === "provisioning" && "Provisioning tenant and Odoo mapping"}
          {state.status === "syncing" && "Running connectivity checks and seeding entities"}
          {state.status === "error" && (state.error || "Unknown error")}
        </div>
      </div>
    </div>
  );
}
