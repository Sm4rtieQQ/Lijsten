import { describe, expect, it } from "vitest";

import { createListItem } from "../types/app";
import type { OutboxEntry, OutboxOpPayload } from "../types/sync";
import {
  compactOutbox,
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

describe("compactOutbox — wachtende operaties samenvoegen (AGENTS.md §7.3)", () => {
  const item = createListItem({ listId: "L1", text: "melk" });
  const types = (q: OutboxEntry[]): string[] => q.map((e) => e.type);
  const failed = (e: OutboxEntry): OutboxEntry => ({
    ...e,
    attempts: 1,
    lastError: "Synchronisatie mislukt. Probeer het opnieuw.",
  });

  it("create + updates → één create met de eindstand", () => {
    const queue = [
      entry({ type: "item.create", item }),
      entry({ type: "item.update", item: { ...item, done: true } }),
      entry({
        type: "item.update",
        item: { ...item, done: true, text: "havermelk" },
      }),
    ];
    const out = compactOutbox(queue);
    expect(types(out)).toEqual(["item.create"]);
    expect(out[0]).toMatchObject({ item: { text: "havermelk", done: true } });
    expect(queue).toHaveLength(3); // puur
  });

  it("meerdere updates van een bestaand item → alleen de laatste", () => {
    const out = compactOutbox([
      entry({ type: "item.update", item: { ...item, text: "a" } }),
      entry({ type: "item.update", item: { ...item, text: "b" } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ item: { text: "b" } });
  });

  it("create + delete (nooit verstuurd) → beide weg, met de updates ertussen", () => {
    const out = compactOutbox([
      entry({ type: "item.create", item }),
      entry({ type: "item.update", item: { ...item, done: true } }),
      entry({ type: "item.delete", itemId: item.id, listId: "L1" }),
    ]);
    expect(out).toEqual([]);
  });

  it("delete van een bestaand item blijft staan; een update ervoor vervalt", () => {
    const out = compactOutbox([
      entry({ type: "item.update", item }),
      entry({ type: "item.delete", itemId: item.id, listId: "L1" }),
    ]);
    expect(types(out)).toEqual(["item.delete"]);
  });

  it("list.create + hernoemen → één create met de laatste titel; updates ontdubbeld", () => {
    const out = compactOutbox([
      entry({ type: "list.create", listId: "L1", title: "a" }),
      entry({ type: "list.update", listId: "L1", title: "b" }),
      entry({ type: "list.update", listId: "L2", title: "x" }),
      entry({ type: "list.update", listId: "L2", title: "y" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "list.create", title: "b" });
    expect(out[1]).toMatchObject({
      type: "list.update",
      listId: "L2",
      title: "y",
    });
  });

  it("reorders → alleen de laatste per lijst, ná de creates die hij noemt", () => {
    const second = createListItem({ listId: "L1", text: "brood" });
    const out = compactOutbox([
      entry({ type: "item.create", item }),
      entry({ type: "item.reorder", listId: "L1", itemIds: [item.id] }),
      entry({ type: "item.reorder", listId: "L2", itemIds: ["z"] }),
      entry({ type: "item.create", item: second }),
      entry({
        type: "item.reorder",
        listId: "L1",
        itemIds: [second.id, item.id],
      }),
      entry({ type: "list.reorder", listIds: ["L1", "L2"] }),
      entry({ type: "list.reorder", listIds: ["L2", "L1"] }),
    ]);
    expect(types(out)).toEqual([
      "item.create",
      "item.reorder", // L2
      "item.create",
      "item.reorder", // L1, de laatste
      "list.reorder",
    ]);
    expect(out[3]).toMatchObject({
      listId: "L1",
      itemIds: [second.id, item.id],
    });
    expect(out[4]).toMatchObject({ listIds: ["L2", "L1"] });
  });

  it("raakt gefaalde operaties niet aan en vouwt er niets in", () => {
    const create = failed(entry({ type: "item.create", item }));
    const update = entry({
      type: "item.update",
      item: { ...item, done: true },
    });
    const del = entry({ type: "item.delete", itemId: item.id, listId: "L1" });
    const out = compactOutbox([create, update, del]);
    // De create kan na een timeout tóch op de server staan: de delete blijft.
    expect(out).toEqual([create, del]);
  });

  it("is idempotent", () => {
    const queue = [
      entry({ type: "item.create", item }),
      entry({ type: "item.update", item: { ...item, done: true } }),
      entry({ type: "item.reorder", listId: "L1", itemIds: [item.id] }),
    ];
    const once = compactOutbox(queue);
    expect(compactOutbox(once)).toEqual(once);
  });
});
