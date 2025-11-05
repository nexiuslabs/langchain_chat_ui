'use client';
import { useEffect } from 'react';
import { installGlobalErrorHandlers } from '@/lib/troubleshoot-logger';
import { usePathname } from 'next/navigation';

export default function ClientInit({ sessionId }: { sessionId?: string }) {
  const route = usePathname();
  useEffect(() => {
    try {
      installGlobalErrorHandlers(() => ({ session_id: sessionId, route }));
    } catch { /* ignore */ }
  }, [sessionId, route]);
  return null;
}

