import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeConversation, type ChatMsg } from "../mergeConversation.js";

describe("mergeConversation", () => {
  it("deduplicates repeated messages by stable id while preserving order", () => {
    const initial: ChatMsg[] = [
      {
        id: "sys-1",
        role: "system",
        text: "System ready",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "user-1",
        role: "user",
        text: "Hello",
        timestamp: "2024-01-01T00:00:05.000Z",
      },
    ];

    const update: ChatMsg[] = [
      {
        id: "user-1",
        role: "user",
        text: "Hello",
        timestamp: "2024-01-01T00:01:00.000Z",
      },
      {
        id: "assistant-1",
        role: "assistant",
        text: "Hi there!",
        timestamp: "2024-01-01T00:01:05.000Z",
      },
    ];

    const merged = mergeConversation(initial, update);

    assert.equal(merged.length, 3);
    assert.deepEqual(
      merged.map((m) => m.id),
      ["sys-1", "user-1", "assistant-1"],
    );
    assert.deepEqual(
      merged.map((m) => m.timestamp),
      [
        "2024-01-01T00:00:00.000Z",
        "2024-01-01T00:00:05.000Z",
        "2024-01-01T00:01:05.000Z",
      ],
    );
  });
});

