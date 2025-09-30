"use client"
import React, { useMemo, useRef, useState, useEffect } from "react"

type RowRenderer<T> = (item: T, index: number) => React.ReactNode

export function VirtualList<T>({ items, itemHeight, height, renderRow, overscan = 5 }: { items: T[]; itemHeight: number; height: number; renderRow: RowRenderer<T>; overscan?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const totalHeight = items.length * itemHeight
  const visibleCount = Math.ceil(height / itemHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2)
  const offsetY = startIndex * itemHeight
  const visibleItems = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener("scroll", onScroll)
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div ref={containerRef} style={{ height, overflow: "auto", position: "relative" }}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)`, position: "absolute", top: 0, left: 0, right: 0 }}>
          {visibleItems.map((item, i) => (
            <div key={startIndex + i} style={{ height: itemHeight }}>
              {renderRow(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

