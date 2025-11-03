"use client"
import React, { useEffect, useMemo, useState } from "react"
import AppShell from "@/components/ui/app-shell"
import { useAuthFetch } from "@/lib/useAuthFetch"

type Metrics = {
  job_queue_depth: number
  jobs_processed_total: number
  lead_scores_total: number
  rows_per_min?: number
  p95_job_ms?: number
  chat_ttfb_p95_ms?: number
}

export default function MetricsPage() {
  const [data, setData] = useState<Metrics | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || '').toLowerCase() === 'true'
  const apiBase = useMemo(() => useProxy ? "/api/backend" : (process.env.NEXT_PUBLIC_API_URL || ""), [useProxy])
  const authFetch = useAuthFetch()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await authFetch(`${apiBase}/metrics`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        if (!cancelled) setData(j)
      } catch (e: any) {
        if (!cancelled) setErr(String(e))
      }
    }
    void load()
    const id = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [apiBase, authFetch])

  return (
    <React.Suspense fallback={<div>Loading…</div>}>
      <AppShell />
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-xl font-semibold mb-2">Metrics</h1>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!data ? (
          <div>Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Job Queue</div><div className="text-2xl">{data.job_queue_depth}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Jobs Processed (total)</div><div className="text-2xl">{data.jobs_processed_total}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Lead Scores (total)</div><div className="text-2xl">{data.lead_scores_total}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Rows / min (avg recent)</div><div className="text-2xl">{(data.rows_per_min ?? 0).toFixed(1)}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">p95 Job Time (ms)</div><div className="text-2xl">{Math.round(data.p95_job_ms ?? 0)}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Chat TTFB p95 (ms)</div><div className="text-2xl">{Math.round(data.chat_ttfb_p95_ms ?? 0)}</div></div>
          </div>
        )}
      </div>
    </React.Suspense>
  )
}
