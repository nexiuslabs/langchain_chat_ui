"use client"
import React from "react"
import { useJobPolling } from "@/hooks/useJobPolling"
import { useAuthFetch } from "@/lib/useAuthFetch"

export function JobsProgress({ apiBase, jobId }: { apiBase: string; jobId: number }) {
  const authFetch = useAuthFetch()
  const { status, loading, done } = useJobPolling(apiBase, jobId, 1500, authFetch)
  const processed = status?.processed ?? 0
  const total = status?.total ?? 0
  const pct = total > 0 ? Math.round((processed / total) * 100) : undefined
  const label = status?.status ?? (loading ? "loading" : "unknown")
  return (
    <div className="w-full p-2 border rounded-md">
      <div className="text-sm text-muted-foreground">Job #{jobId} — {label}</div>
      <div className="h-2 w-full bg-muted rounded mt-2">
        <div
          className="h-2 bg-blue-500 rounded"
          style={{ width: pct !== undefined ? `${pct}%` : (label === "done" ? "100%" : "0%") }}
        />
      </div>
      <div className="text-xs mt-1 text-muted-foreground">{processed} / {total} {pct !== undefined ? `(${pct}%)` : ""}</div>
      {done && status?.error && (
        <div className="text-xs text-red-600 mt-1">Error: {status.error}</div>
      )}
    </div>
  )
}
