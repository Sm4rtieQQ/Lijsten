import { describe, expect, it } from "vitest";

import { createListItem } from "../types/app";
import type { OutboxEntry, OutboxOpPayload } from "../types/sync";
import {
  createOutboxEntry,
  nextRetryAttempt,
  pruneQueueForList,
} from "./outbox";

const entry = (op: OutboxOpPayload): OutboxEntry => createOutboxEntry(op);

describe("createOutboxEntry", () => {
  it("voegt opId, createdAt en een schone poging-status toe", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const e = createOutboxEntry(
      { type: "list.create", listId: "l1", title: "x" },
      now,
    );
    expect(e).toMatchObject({
      type: "list.create",
      listId: "l1",
      createdAt: now.toISOString(),
      attempts: 0,
      lastError: null,
    });
    expect(e.opId).toBeTruthy();
  });
});

describe("pruneQueueForList", () => {
  it("haalt alle operatietypes van die lijst weg en laat de rest staan", () => {
    const item = createListItem({ listId: "gone", text: "a" });
    const other = createListItem({ listId: "keep", text: "b" });
    const queue = [
      entry({ type: "list.create", listId: "gone", title: "x" }),
      entry({ type: "list.update", listId: "gone", title: "y" }),
      entry({ type: "item.create", item }),
      entry({ type: "item.update", item }),
      entry({ type: "item.delete", itemId: item.id, listId: "gone" }),
      entry({ type: "item.reorder", listId: "gone", itemIds: [item.id] }),
      entry({ type: "list.reorder", listIds: ["keep", "gone"] }),
      entry({ type: "list.create", listId: "keep", title: "k" }),
      entry({ type: "item.create", item: other }),
    ];
    const pruned = pruneQueueForList(queue, "gone");
    expect(pruned.map((e) => e.type)).toEqual(["list.create", "item.create"]);
    expect(queue).toHaveLength(9);
  });
});

describe("nextRetryAttempt", () => {
  it("is de hoogste attempts + 1 (1 bij een lege wachtrij)", () => {
    expect(nextRetryAttempt([])).toBe(1);
    const a = { ...entry({ type: "list.delete", listId: "a" }), attempts: 2 };
    const b = { ...entry({ type: "list.delete", listId: "b" }), attempts: 4 };
    expect(nextRetryAttempt([a, b])).toBe(5);
  });
});
