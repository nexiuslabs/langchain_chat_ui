export type ChatMsg = {
  id: string;
  role: "system" | "user" | "assistant";
  text: string;
  timestamp: string; // ISO 8601
};

function isIsoDate(s: string | undefined | null): boolean {
  if (!s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function mergeConversation(existing_history: ChatMsg[], new_messages: ChatMsg[]): ChatMsg[] {
  const allowed = new Set(["system", "user", "assistant"]);
  const all: ChatMsg[] = [...(existing_history || []), ...(new_messages || [])]
    .filter(Boolean)
    .map((m) => ({
      id: String(m.id || ""),
      role: (m.role as ChatMsg["role"]) || "assistant",
      text: String((m.text ?? "").toString()),
      timestamp: String(m.timestamp || ""),
    }))
    .filter((m) => !!m.id || (m.text.trim().length > 0 && isIsoDate(m.timestamp)))
    .filter((m) => allowed.has(m.role));

  const seenIds = new Set<string>();
  const seenTextTs = new Set<string>();
  const unique: ChatMsg[] = [];
  for (const m of all) {
    const idKey = `id:${m.id}`;
    const textTsKey = `tt:${m.text}|${m.timestamp}`;
    if (seenIds.has(idKey) || seenTextTs.has(textTsKey)) continue;
    seenIds.add(idKey);
    seenTextTs.add(textTsKey);
    unique.push(m);
  }
  unique.sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (ta === tb) return a.id.localeCompare(b.id);
    return ta - tb;
  });
  return unique;
}
