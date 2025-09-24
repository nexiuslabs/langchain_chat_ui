import { useEffect, useRef, useState } from "react"

export type JobStatus = {
  job_id?: number
  status: "queued" | "running" | "done" | "error"
  processed?: number
  total?: number
  error?: string | null
}

export function useJobPolling(
  apiBase: string,
  jobId: number | null,
  intervalMs = 1500,
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    const fetchOnce = async () => {
      try {
        const f = fetcher || ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { credentials: 'include', ...(init || {}) }))
        const res = await f(`${apiBase}/jobs/${jobId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const js = await res.json()
        setStatus(js)
        const s = (js?.status || "").toLowerCase()
        if (s === "done" || s === "error") {
          setDone(true)
          if (timerRef.current) clearInterval(timerRef.current)
        }
      } catch (e) {
        // Non-fatal; keep polling a couple more rounds
      } finally {
        setLoading(false)
      }
    }
    fetchOnce()
    timerRef.current = setInterval(fetchOnce, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [apiBase, jobId, intervalMs])

  return { status, loading, done }
}
