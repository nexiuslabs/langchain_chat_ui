import type { Message } from "@langchain/langgraph-sdk";

/**
 * Extracts a string summary from a message's content, supporting multimodal (text, image, file, etc.).
 * - If text is present, returns the joined text.
 * - If not, returns a label for the first non-text modality (e.g., 'Image', 'Other').
 * - If unknown, returns 'Multimodal message'.
 */
export function getContentString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  const texts = content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text);
  return texts.join(" ");
}

/**
 * Derive a human-friendly thread label from a summary text.
 * - Prefer a domain found in the text (e.g., example.com)
 * - Else use the leading 60 chars of the text
 */
export function deriveLabelFromSummary(text: string): string {
  const t = (text || "").trim();
  if (!t) return "ICP session";
  try {
    // naive domain finder: match host from URL or bare domain
    const m = t.match(/https?:\/\/([^\s/)]+)|\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
    if (m) {
      const host = (m[1] || m[0]).replace(/^https?:\/\//i, "").replace(/[,.;:)]$/, "");
      if (host) return host.toLowerCase();
    }
  } catch {
    // ignore
  }
  return t.split(/\s+/).join(" ").slice(0, 60);
}
