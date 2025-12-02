"use client";

import React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import ClientInit from "@/app/providers/ClientInit";
import { TenantProvider } from "@/providers/Tenant";

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
      <TenantProvider>
        <SessionAwareInit>{children}</SessionAwareInit>
      </TenantProvider>
    </SessionProvider>
  );
}
