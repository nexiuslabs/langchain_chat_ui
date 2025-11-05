"use client";

import React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import ClientInit from "@/app/providers/ClientInit";

type Props = {
  children: React.ReactNode;
};

function SessionAwareInit({ children }: Props) {
  const { data } = useSession();
  const sessionId = (data as any)?.user?.email || undefined;
  return (
    <>
      <ClientInit sessionId={sessionId} />
      {children}
    </>
  );
}

export default function AppProviders({ children }: Props) {
  return (
    <SessionProvider>
      <SessionAwareInit>{children}</SessionAwareInit>
    </SessionProvider>
  );
}
