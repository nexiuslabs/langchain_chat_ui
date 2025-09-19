"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { ArtifactProvider } from "@/components/thread/artifact";
import { Toaster } from "@/components/ui/sonner";
import React, { useEffect, useRef } from "react";
import HeaderBar from "@/components/ui/header-bar";
import { FirstLoginGate } from "@/components/onboarding/FirstLoginGate";
import { useSession } from "next-auth/react";

export default function DemoPage(): React.ReactNode {
  const { data: session, status } = useSession();
  const exchangedRef = useRef(false);

  // If SSO (NextAuth) is being used, exchange the ID token for server cookies
  useEffect(() => {
    async function run() {
      try {
        if (exchangedRef.current) return;
        const idToken = (session as any)?.idToken as string | undefined;
        if (status === "authenticated" && idToken) {
          const base = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === 'true'
            ? "/api/backend"
            : (process.env.NEXT_PUBLIC_API_URL || "");
          const res = await fetch(`${base}/auth/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ id_token: idToken }),
          });
          if (res.ok) exchangedRef.current = true;
        }
      } catch {}
    }
    run();
  }, [session, status]);
  return (
    <React.Suspense fallback={<div>Loading (layout)...</div>}>
      <HeaderBar />
      <Toaster />
      <FirstLoginGate>
        <ThreadProvider>
          <StreamProvider>
            <ArtifactProvider>
              <Thread />
            </ArtifactProvider>
          </StreamProvider>
        </ThreadProvider>
      </FirstLoginGate>
    </React.Suspense>
  );
}
