"use client";
import React from "react";
import { useChatProgress } from "@/providers/ChatProgress";

export function ChatProgressFeed() {
  const { events } = useChatProgress();
  if (!events.length) return null;
  // Render compact, recent-first capped to last ~8 visible rows
  const last = events.slice(-8);
  return (
    <div className="mt-2 mb-4 max-w-3xl text-xs text-muted-foreground space-y-1">
      {last.map((e) => (
        <div key={e.id} className="flex gap-2 items-start">
          <span className="min-w-28 text-[11px] uppercase tracking-wide text-muted-foreground/70">{e.label}</span>
          <span className="flex-1">
            {e.message || (typeof e.data === 'string' ? e.data : (e.data?.message || JSON.stringify(e.data)))}
          </span>
        </div>
      ))}
    </div>
  );
}
