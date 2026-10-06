import type { SupabaseClient } from "@supabase/supabase-js";

import { toUserFacingError } from "./errorMessages";
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
  const queue = loadQueue(userId, backend);
  if (queue.length === 0) {
    return { ok: true, error: null, syncedCount: 0, queuedCount: 0, queue };
  }

  const pending = [...queue];
  const done: OutboxEntry[] = [];
  let syncedCount = 0;

  while (pending.length > 0) {
    const entry = pending.shift();
    if (!entry) break;

    const result = await applyEntry(entry, userId, client);
    if (!result.ok) {
      const failed: OutboxEntry = {
        ...entry,
        attempts: entry.attempts + 1,
        lastError: result.error ?? "Onbekende synchronisatiefout",
      };
      // gefaalde entry → terug aan de kop van de wachtrij, rest blijft erna
      const nextQueue = [...done, failed, ...pending];
      saveQueue(userId, nextQueue, backend);
      saveSyncMeta(
        userId,
        {
          lastSyncedAt: loadSyncMeta(userId, backend).lastSyncedAt,
          lastError: failed.lastError,
        },
        backend,
      );
      return {
        ok: false,
        error: failed.lastError,
        syncedCount,
        queuedCount: nextQueue.length,
        queue: nextQueue,
      };
    }
    done.push(entry);
    syncedCount += 1;
  }

  saveSyncMeta(
    userId,
    { lastSyncedAt: new Date().toISOString(), lastError: null },
    backend,
  );
  saveQueue(userId, [], backend);
  return { ok: true, error: null, syncedCount, queuedCount: 0, queue: [] };
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
  try {
    // D2-fix (fase D): een hangende network-request mag de flush nooit kunnen
    // blokkeren (anders blijft `runFlush` op "syncing" hangen). Na de timeout
    // wordt de entry als mislukt gemarkeerd en gaat de backoff-cyclus verder.
    const error = await withTimeout(
      applyToClient(entry, userId, client),
      REQUEST_TIMEOUT_MS,
    );
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
interface ServerList {
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
    const lists: List[] = rows.map((row) => ({
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
    }));

    return { data: lists, error: null };
  } catch (err) {
    // Netwerk weg / timeout: nooit een rejection doorslaan naar de caller.
    return { data: [], error: toUserFacingError(err) };
  }
}

/** Backoff in milliseconden bij een gefaalde operatie. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts), 60_000);
}
