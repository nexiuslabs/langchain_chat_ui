import { useRef } from "react"

export function useDebouncedFetch(delay = 400) {
  const ctrlRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function run<T = any>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (ctrlRef.current) ctrlRef.current.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    return new Promise<T>((resolve, reject) => {
      timeoutRef.current = setTimeout(async () => {
        try {
          const res = await fn(ctrl.signal)
          resolve(res)
        } catch (e) {
          reject(e)
        }
      }, delay)
    })
  }

  function cancel() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (ctrlRef.current) ctrlRef.current.abort()
    timeoutRef.current = null
    ctrlRef.current = null
  }

  return { run, cancel }
}

