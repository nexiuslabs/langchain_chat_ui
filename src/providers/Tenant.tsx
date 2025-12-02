"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { logEvent } from "@/lib/troubleshoot-logger";

type TenantContextValue = {
  tenantId: string | null;
  setTenantId: (value: string | null) => void;
};

const STORAGE_KEY = "lg:chat:tenantId";
const EVENT_NAME = "lg:tenant-change";

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

function readTenantFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length ? value : null;
  } catch (_err) {
    return null;
  }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantIdState] = useState<string | null>(() => readTenantFromStorage());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setTenantIdState(readTenantFromStorage());
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      sync();
    };
    const handleCustom = () => sync();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(EVENT_NAME, handleCustom as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustom as EventListener);
    };
  }, []);

  const setTenantId = useCallback((value: string | null) => {
    const normalized = value && value.trim().length ? value.trim() : null;
    if (typeof window !== "undefined") {
      try {
        if (normalized) {
          window.localStorage.setItem(STORAGE_KEY, normalized);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: normalized }));
      } catch (_err) {
        // Ignore storage errors (e.g., Safari private mode)
      }
    }
    logEvent({ level: "info", message: "Tenant context updated", component: "TenantProvider", data: { tenant_id: normalized } });
    setTenantIdState(normalized);
  }, []);

  const value = useMemo(() => ({ tenantId, setTenantId }), [tenantId, setTenantId]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}
