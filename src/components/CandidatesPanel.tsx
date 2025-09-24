"use client"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { VirtualList } from "@/components/VirtualList"
import { useAuthFetch } from "@/lib/useAuthFetch"

type Candidate = { company_id: number; name: string | null; industry_norm: string | null; website_domain: string | null; last_seen: string | null }

export function CandidatesPanel({ height = 420 }: { height?: number }) {
  const [items, setItems] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [industry, setIndustry] = useState<string>("")
  const doneRef = useRef(false)

  const useProxy = (process.env.NEXT_PUBLIC_USE_API_PROXY || '').toLowerCase() === 'true'
  const apiBase = useMemo(() => useProxy ? "/api/backend" : (process.env.NEXT_PUBLIC_API_URL || ""), [useProxy])
  const authFetch = useAuthFetch()

  async function loadMore(reset = false) {
    if (loading || doneRef.current) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("limit", "100")
      if (industry.trim()) params.set("industry", industry.trim())
      if (!reset && cursor) {
        if (cursor.afterUpdatedAt) params.set("afterUpdatedAt", cursor.afterUpdatedAt)
        if (cursor.afterId) params.set("afterId", String(cursor.afterId))
      }
      const res = await authFetch(`${apiBase}/candidates/latest?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      const newItems: Candidate[] = j?.items || []
      setItems(prev => reset ? newItems : prev.concat(newItems))
      const next = j?.nextCursor || null
      setCursor(next)
      if (!next || !newItems.length) doneRef.current = true
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    doneRef.current = false
    setCursor(null)
    setItems([])
    void loadMore(true)
  }, [industry])

  // Auto-load more when near end
  useEffect(() => {
    if (items.length < 100 || loading || doneRef.current) return
    // if list is short, try to fill a bit more
    void loadMore(false)
  }, [items, loading])

  const row = (c: Candidate) => (
    <div className="px-2 py-2 border-b text-sm flex items-center gap-3">
      <div className="w-20 text-gray-500">#{c.company_id}</div>
      <div className="flex-1 truncate">
        <div className="font-medium truncate">{c.name || '(unnamed)'}</div>
        <div className="text-xs text-gray-500 truncate">{c.industry_norm || '—'} · {c.website_domain || '—'} · {c.last_seen ? new Date(c.last_seen).toLocaleString() : '—'}</div>
      </div>
    </div>
  )

  return (
    <div className="w-full border rounded p-2">
      <div className="flex items-center gap-2 mb-2">
        <input className="border rounded px-2 py-1 text-sm" placeholder="filter by industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        <button className="text-sm px-2 py-1 border rounded" onClick={() => { doneRef.current = false; void loadMore(true) }}>Refresh</button>
        {loading && <span className="text-xs text-gray-500">Loading…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      <VirtualList items={items} itemHeight={56} height={height} renderRow={(c) => row(c)} />
      {!doneRef.current && (
        <div className="mt-2 flex justify-center">
          <button className="text-sm px-2 py-1 border rounded" onClick={() => void loadMore(false)}>Load more</button>
        </div>
      )}
    </div>
  )
}
