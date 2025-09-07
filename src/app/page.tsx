"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { ArtifactProvider } from "@/components/thread/artifact";
import { Toaster } from "@/components/ui/sonner";
import React from "react";
import { useSession, signIn } from "next-auth/react";
import HeaderBar from "@/components/ui/header-bar";
import { FirstLoginGate } from "@/components/onboarding/FirstLoginGate";

export default function DemoPage(): React.ReactNode {
  const { status } = useSession();
  if (status === "loading") return <div />;
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4">
        <div className="border rounded-md shadow-sm p-6 max-w-md w-full space-y-4 text-center">
          <div className="text-xl font-semibold">Welcome</div>
          <div className="text-sm text-muted-foreground">
            Sign in with Nexius SSO to continue.
          </div>
          <div className="pt-2">
            <button
              className="px-4 py-2 text-sm border rounded"
              onClick={() => signIn("nexius", { callbackUrl: "/" })}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }
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
