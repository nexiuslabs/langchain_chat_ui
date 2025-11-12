"use client"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useAuthFetch } from "@/lib/useAuthFetch"

type Candidate = { company_id: number; name: string | null; industry_norm: string | null; website_domain: string | null; last_seen: string | null }

export function CandidatesPanel({ height = 640 }: { height?: number }) {
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

  const formatDate = (value: string | null) => {
    if (!value) return "—"
    try {
      return new Date(value).toLocaleString()
    } catch (err) {
      return value
    }
  }

  const tableHeight = Math.max(height, 240)

  return (
    <div className="w-full border rounded-lg bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/40">
        <input
          className="border rounded px-2 py-1 text-sm w-48"
          placeholder="Filter by industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        />
        <button
          className="text-sm px-3 py-1 border rounded bg-background hover:bg-muted transition"
          onClick={() => {
            doneRef.current = false
            void loadMore(true)
          }}
        >
          Refresh
        </button>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      <div className="overflow-auto" style={{ height: `${tableHeight}px` }}>
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
              <th className="w-20">ID</th>
              <th className="w-56">Company</th>
              <th className="w-48">Industry</th>
              <th className="w-64">Website</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No candidates yet. Run enrichment or adjust your filters.
                </td>
              </tr>
            ) : (
              items.map((c, idx) => (
                <tr key={`${c.company_id}-${c.last_seen ?? 'na'}-${idx}`}
                    className="odd:bg-background even:bg-muted/20 border-b border-border/60">
                  <td className="px-3 py-2 text-muted-foreground">#{c.company_id}</td>
                  <td className="px-3 py-2 font-medium truncate">{c.name || "(unnamed)"}</td>
                  <td className="px-3 py-2 truncate text-muted-foreground">{c.industry_norm || "—"}</td>
                  <td className="px-3 py-2 truncate text-blue-600">
                    {c.website_domain ? (
                      <a href={`https://${c.website_domain}`} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.website_domain}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(c.last_seen)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="p-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{items.length} rows</span>
        {!doneRef.current && (
          <button
            className="text-sm px-3 py-1 border rounded bg-background hover:bg-muted transition"
            onClick={() => void loadMore(false)}
            disabled={loading}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  )
}
