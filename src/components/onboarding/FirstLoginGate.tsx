"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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
  const { status } = useSession();
  const authFetch = useAuthFetch();
  const [state, setState] = useState<{ status: Status; error?: string }>({ status: "unknown" });

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    async function kickOff() {
      try {
        const res = await authFetch(`${apiBase}/onboarding/first_login`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setState({ status: (body.status as Status) || "provisioning" });
      } catch (e: any) {
        if (!cancelled) setState({ status: "error", error: String(e) });
      }
    }
    kickOff();

    const iv = setInterval(async () => {
      try {
        const res = await authFetch(`${apiBase}/onboarding/status`);
        const body = await res.json();
        if (!cancelled) setState({ status: (body.status as Status) || "provisioning", error: body.error });
        if (body.status === "ready") clearInterval(iv);
      } catch (e: any) {
        if (!cancelled) setState({ status: "error", error: String(e) });
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [status, apiBase, authFetch]);

  if (status !== "authenticated") return <div />;
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
