"use client";
import React from "react";
import { useChatProgress } from "@/providers/ChatProgress";
import { MarkdownText } from "./markdown-text";

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
          <div className="flex-1 [&_.markdown-content]:text-xs">
            <MarkdownText>
              {(() => {
                if (typeof e.message === "string" && e.message.trim().length > 0) {
                  return e.message;
                }
                if (typeof e.data === "string") {
                  return e.data;
                }
                if (e.data && typeof e.data.message === "string") {
                  return e.data.message;
                }
                if (e.data) {
                  try {
                    return "```json\n" + JSON.stringify(e.data, null, 2) + "\n```";
                  } catch (_err) {
                    return String(e.data);
                  }
                }
                return "";
              })()}
            </MarkdownText>
          </div>
        </div>
      ))}
    </div>
  );
}
