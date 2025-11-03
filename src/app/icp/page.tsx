"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthFetch } from "@/lib/useAuthFetch";

type Suggestion = {
  id: string;
  title: string;
  evidence_count: number;
  rationale?: string;
  targeting_pack?: { ssic_filters?: string[]; technographic_filters?: string[]; pitch?: string };
  negative_icp?: { theme: string; count: number; reason: string }[];
};

export default function ICPPage() {
  const authFetch = useAuthFetch();
  const apiBase = useMemo(() => (process.env.NEXT_PUBLIC_API_URL || ""), []);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${apiBase}/icp/suggestions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const js = await res.json();
      setItems(js || []);
    } catch (e: any) {
      setError(e?.message || "failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authFetch]);

  useEffect(() => { void load(); }, [load]);

  const onAccept = useCallback(async (id: string) => {
    try {
      const body = id ? { suggestion_id: id } : {} as any;
      const res = await authFetch(`${apiBase}/icp/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccepted(id);
    } catch (e: any) {
      setError(e?.message || "accept failed");
    }
  }, [apiBase, authFetch]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ICP Suggestions</h1>
        <button onClick={() => load()} className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-1 gap-3">
        {items.map((it) => (
          <div key={it.id} className="border rounded p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{it.title}</div>
              <button onClick={() => onAccept(it.id)} className="px-2 py-1 text-sm rounded bg-emerald-600 text-white">Accept</button>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Evidence: {it.evidence_count}{it.rationale ? ` — ${it.rationale}` : ''}</div>
            {it.targeting_pack && (
              <div className="mt-2 text-sm">
                <div className="font-medium">Targeting Pack</div>
                <div>SSIC: {it.targeting_pack.ssic_filters?.join(", ") || '—'}</div>
                <div>Tech: {it.targeting_pack.technographic_filters?.join(", ") || '—'}</div>
                <div className="text-foreground">Pitch: {it.targeting_pack.pitch || '—'}</div>
              </div>
            )}
            {it.negative_icp && it.negative_icp.length > 0 && (
              <div className="mt-2 text-sm">
                <div className="font-medium">Negative ICP (derived)</div>
                <ul className="list-disc list-inside text-foreground">
                  {it.negative_icp.map((n, idx) => <li key={idx}>{n.theme.replaceAll('_', ' ')} — {n.count}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
      {accepted && (
        <div className="p-2 text-sm text-emerald-700 bg-emerald-50 rounded">Accepted: {accepted}</div>
      )}
    </div>
  );
}
