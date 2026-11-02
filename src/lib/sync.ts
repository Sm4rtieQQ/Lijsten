import type { SupabaseClient } from "@supabase/supabase-js";

import { toUserFacingError } from "./errorMessages";
import { compactOutbox, nextBatch } from "./outbox";
import type { OutboxEntry } from "../types/sync";
import type { List } from "../types/app";
import type { Database } from "./database.types";
import {
  loadQueue,
  saveQueue,
  loadSyncMeta,
  saveSyncMeta,
  type StorageBackend,
} from "./storage";

/**
 * Verwerkt de outbox van één gebruiker in FIFO-volgorde met per-entiteit
 * operaties (create/update/delete per lijst/item).
 *
 * Dit vervangt de oude "bulk-wipe" (`DELETE .eq(owner_id, ...)` gevolgd door
 * mass-insert van de volledige snapshot), die de oorzaak was van het
 * cross-user datalek. Er wordt NOOIT in bulk over de huidige snapshot
 * geschreven; alleen expliciet in de outbox geplaatste operaties raken de
 * server.
 *
 * Bij de eerste fout wordt gestopt en de betreffende operatie gemarkeerd
 * (`attempts+1`, `lastError`) zodat de UI dit kan tonen en met backoff
 * opnieuw kan proberen. FIFO-volgorde en de volgordeafhankelijkheid tussen
 * operaties (bv. item.create ná list.create van dezelfde lijst) blijven zo
 * gegarandeerd.
 */
export interface FlushResult {
  ok: boolean;
  /** Foutmelding als een operatie faalde. */
  error: string | null;
  /** Aantal succesvol verwerkte operaties in deze run. */
  syncedCount: number;
  queuedCount: number;
  /** Outbox na de run (voor statusopbouw). */
  queue: OutboxEntry[];
}

export async function flushOutbox(
  userId: string,
  client: SupabaseClient<Database>,
  backend: StorageBackend,
): Promise<FlushResult> {
  const stored = loadQueue(userId, backend);
  // Wachtende operaties eerst samenvoegen (§7.3): minder requests. De
  // samengevoegde wachtrij wordt meteen opgeslagen, zodat een afgebroken run
  // niet opnieuw met de oude, langere wachtrij begint.
  const queue = compactOutbox(stored);
  if (queue.length !== stored.length) saveQueue(userId, queue, backend);
  if (queue.length === 0) {
    return { ok: true, error: null, syncedCount: 0, queuedCount: 0, queue };
  }

  const pending = [...queue];
  const done: OutboxEntry[] = [];
  let syncedCount = 0;

  /**
   * De wachtrij na deze run, opgebouwd vanuit de wachtrij zoals die **nu** is:
   * verstuurde operaties eruit, de gefaalde bijgewerkt. Wat tijdens het
   * versturen is toegevoegd (of weggehaald, bv. door een verwijderde lijst)
   * blijft zo staan. Verstuurde operaties komen nooit terug in de wachtrij,
   * anders worden ze bij de retry dubbel verstuurd.
   */
  const settle = (failed: readonly OutboxEntry[]): OutboxEntry[] => {
    const doneIds = new Set(done.map((entry) => entry.opId));
    const failedById = new Map(failed.map((entry) => [entry.opId, entry]));
    const next = loadQueue(userId, backend)
      .filter((entry) => !doneIds.has(entry.opId))
      .map((entry) => failedById.get(entry.opId) ?? entry);
    saveQueue(userId, next, backend);
    return next;
  };

  while (pending.length > 0) {
    // Opeenvolgende creates/deletes gaan samen in één request (§7.3).
    const batch = nextBatch(pending);
    if (batch.length === 0) break;
    pending.splice(0, batch.length);

    const result = await applyBatch(batch, userId, client);
    if (!result.ok) {
      const lastError = result.error ?? "Onbekende synchronisatiefout";
      // Een mislukte bundel markeert al zijn operaties; ze blijven op hun plek
      // (de kop van wat nog moet), het verstuurde gaat eruit.
      const failed = batch.map((entry) => ({
        ...entry,
        attempts: entry.attempts + 1,
        lastError,
      }));
      const nextQueue = settle(failed);
      saveSyncMeta(
        userId,
        {
          lastSyncedAt: loadSyncMeta(userId, backend).lastSyncedAt,
          lastError,
        },
        backend,
      );
      return {
        ok: false,
        error: lastError,
        syncedCount,
        queuedCount: nextQueue.length,
        queue: nextQueue,
      };
    }
    done.push(...batch);
    syncedCount += batch.length;
  }

  saveSyncMeta(
    userId,
    { lastSyncedAt: new Date().toISOString(), lastError: null },
    backend,
  );
  // Meestal leeg; niet leeg als er tijdens het versturen iets is gewijzigd —
  // dat gaat dan met de volgende run mee.
  const rest = settle([]);
  return {
    ok: true,
    error: null,
    syncedCount,
    queuedCount: rest.length,
    queue: rest,
  };
}

/** Maximale wachttijd per server-actie voordat we de verbinding opgeven. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Race een (mogelijk hangende) belofte met een timeout. Als de belofte niet op
 * tijd klaar is, reject deze racer met een "timeout"-fout — de oorspronkelijke
 * belofte blijft wel afhandelbaar (`.then`-handlers zijn attacht), dus nooit
 * een unhandled rejection; zijn resultaat wordt simpelweg genegeerd.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Past één outbox-entry toe op Supabase. Reject NOOIT (AGENTS.md §7.5/D2). */
async function applyEntry(
  entry: OutboxEntry,
  userId: string,
  client: SupabaseClient<Database>,
): Promise<{ ok: boolean; error: string | null }> {
  return guarded(() => applyToClient(entry, userId, client));
}

/**
 * Past een groep operaties toe (zie `nextBatch`): één operatie zoals altijd,
 * meerdere `item.create` als één insert, meerdere `item.delete` van één lijst
 * als één delete. Reject nooit.
 */
async function applyBatch(
  batch: readonly OutboxEntry[],
  userId: string,
  client: SupabaseClient<Database>,
): Promise<{ ok: boolean; error: string | null }> {
  const [first] = batch;
  if (!first) return { ok: true, error: null };
  if (batch.length === 1) return applyEntry(first, userId, client);

  return guarded(async () => {
    if (first.type === "item.create") {
      const rows = batch.flatMap((entry) =>
        entry.type === "item.create"
          ? [
              {
                id: entry.item.id,
                list_id: entry.item.listId,
                text: entry.item.text,
                done: entry.item.done,
                position: entry.item.position,
              },
            ]
          : [],
      );
      return (await client.from("list_items").insert(rows)).error;
    }
    if (first.type === "item.delete") {
      const ids = batch.flatMap((entry) =>
        entry.type === "item.delete" ? [entry.itemId] : [],
      );
      // Altijd met id-filter (geen bulk-wipe) én op de lijst (defense in depth).
      const res = await client
        .from("list_items")
        .delete()
        .in("id", ids)
        .eq("list_id", first.listId);
      return res.error;
    }
    // `nextBatch` bundelt niets anders; voor de zekerheid één voor één.
    for (const entry of batch) {
      const error = await applyToClient(entry, userId, client);
      if (error) return error;
    }
    return null;
  });
}

/**
 * Voert een server-actie uit met timeout en leesbare NL-fout; reject nooit
 * (AGENTS.md §7.5/D2).
 */
async function guarded(
  run: () => PromiseLike<{ message: string } | null>,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    // D2-fix (fase D): een hangende network-request mag de flush nooit kunnen
    // blokkeren (anders blijft `runFlush` op "syncing" hangen). Na de timeout
    // wordt de entry als mislukt gemarkeerd en gaat de backoff-cyclus verder.
    const error = await withTimeout(run(), REQUEST_TIMEOUT_MS);
    return error
      ? { ok: false, error: toUserFacingError(error) }
      : { ok: true, error: null };
  } catch (err) {
    // Netwerk weg (bv. `TypeError: Failed to fetch`) of timeout: supabase-js
    // gooit hier i.p.v. een error-object terug te geven. Map naar leesbare
    // NL-tekst; de rejection mag nooit doorslaan naar `flushOutbox`/`runFlush`.
    return { ok: false, error: toUserFacingError(err) };
  }
}

/** Voert één outbox-entry uit; geeft de raw Supabase-fout terug (of null). */
async function applyToClient(
  entry: OutboxEntry,
  userId: string,
  client: SupabaseClient<Database>,
): Promise<{ message: string } | null> {
  let error: { message: string } | null = null;

  switch (entry.type) {
    case "list.create": {
      const res = await client.from("lists").insert({
        id: entry.listId,
        owner_id: userId,
        title: entry.title,
      });
      error = res.error;
      break;
    }
    case "list.update": {
      const res = await client
        .from("lists")
        .update({ title: entry.title })
        .eq("id", entry.listId)
        .eq("owner_id", userId);
      error = res.error;
      break;
    }
    case "list.delete": {
      const res = await client
        .from("lists")
        .delete()
        .eq("id", entry.listId)
        .eq("owner_id", userId);
      error = res.error;
      break;
    }
    case "item.create": {
      const res = await client.from("list_items").insert({
        id: entry.item.id,
        list_id: entry.item.listId,
        text: entry.item.text,
        done: entry.item.done,
        position: entry.item.position,
      });
      error = res.error;
      break;
    }
    case "item.update": {
      const res = await client
        .from("list_items")
        .update({
          text: entry.item.text,
          done: entry.item.done,
          position: entry.item.position,
        })
        .eq("id", entry.item.id)
        .eq("list_id", entry.item.listId);
      error = res.error;
      break;
    }
    case "item.delete": {
      const res = await client
        .from("list_items")
        .delete()
        .eq("id", entry.itemId);
      error = res.error;
      break;
    }
    case "list.reorder": {
      const updates = entry.listIds.map((listId, position) =>
        client
          .from("lists")
          .update({ position })
          .eq("id", listId)
          .eq("owner_id", userId),
      );
      const results = await Promise.all(updates);
      error = results.find((r) => r.error)?.error ?? null;
      break;
    }
    case "item.reorder": {
      const updates = entry.itemIds.map((itemId, position) =>
        client
          .from("list_items")
          .update({ position })
          .eq("id", itemId)
          .eq("list_id", entry.listId),
      );
      const results = await Promise.all(updates);
      error = results.find((r) => r.error)?.error ?? null;
      break;
    }
  }

  return error;
}

/** De vorm die Supabase teruggeeft bij het opvragen van lijsten + items. */
export interface ServerList {
  id: string;
  title: string;
  created_at: string;
  list_items: Array<{
    id: string;
    list_id: string;
    text: string;
    done: boolean;
    position: number;
    created_at: string;
  }>;
}

/** Server-rij → domeinmodel; items gesorteerd op `position`. */
export function toDomainList(row: ServerList): List {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    items: [...(row.list_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        listId: item.list_id,
        text: item.text,
        done: item.done,
        position: item.position,
        createdAt: item.created_at,
      })),
  };
}

/** Haalt de lijsten van één gebruiker op, expliciet gefilterd op `owner_id`. */
export async function pullListsFromServer(
  userId: string,
  client: SupabaseClient<Database>,
): Promise<{ data: List[]; error: string | null }> {
  try {
    // Items komen via de geneste relatie mee; RLS schermt ook daar af.
    // De expliciete `.eq("owner_id", userId)` is de eerste verdedigingslaag
    // (defense in depth, zie AGENTS.md §7.1).
    // Net als bij `applyEntry`: een hangende/afgebroken request mag hydrate en
    // refreshData niet kunnen blokkeren; daarom ook hier een timeout.
    const { data, error } = await withTimeout(
      Promise.resolve(
        client
          .from("lists")
          .select(
            "id,title,created_at,list_items(id,list_id,text,done,position,created_at)",
          )
          .eq("owner_id", userId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: false }),
      ),
      REQUEST_TIMEOUT_MS,
    );

    if (error) return { data: [], error: toUserFacingError(error) };

    const rows = (data ?? []) as unknown as ServerList[];
    return { data: rows.map(toDomainList), error: null };
  } catch (err) {
    // Netwerk weg / timeout: nooit een rejection doorslaan naar de caller.
    return { data: [], error: toUserFacingError(err) };
  }
}

/** Backoff in milliseconden bij een gefaalde operatie. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts), 60_000);
}
