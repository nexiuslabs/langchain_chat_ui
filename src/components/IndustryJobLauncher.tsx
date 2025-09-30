"use client"
import React, { useMemo, useState } from "react"
import { useDebouncedFetch } from "@/hooks/useDebouncedFetch"
import { JobsProgress } from "@/components/JobsProgress"
import { useAuthFetch } from "@/lib/useAuthFetch"

export function IndustryJobLauncher() {
  const [text, setText] = useState("")
  const [jobId, setJobId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { run, cancel } = useDebouncedFetch(500)
  const authFetch = useAuthFetch()

  const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || '').toLowerCase() === 'true'
  const apiBase = useMemo(() => useProxy ? "/api/backend" : (process.env.NEXT_PUBLIC_API_URL || ""), [useProxy])

  async function trigger(signal: AbortSignal) {
    setError(null)
    const body = { terms: text.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean) }
    if (!body.terms.length) throw new Error("No terms provided")
    const res = await authFetch(`${apiBase}/jobs/staging_upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    if (typeof j?.job_id === 'number') setJobId(j.job_id)
  }

  function onChange(v: string) {
    setText(v)
    if (!v) { cancel(); return }
    run(trigger).catch(e => setError(String(e)))
  }

  return (
    <div className="w-full border rounded p-2">
      <div className="text-sm text-gray-700 mb-1">Queue nightly upsert for industries</div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. software, logistics, medtech"
        rows={3}
        className="w-full border rounded p-2 text-sm"
      />
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      {jobId && <div className="mt-2"><JobsProgress apiBase={apiBase} jobId={jobId} /></div>}
    </div>
  )
}
