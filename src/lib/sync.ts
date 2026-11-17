import type { SupabaseClient } from "@supabase/supabase-js";

import { toUserFacingError } from "./errorMessages";
import {
  PARK_AFTER_ATTEMPTS,
  blockKeys,
  compactOutbox,
  isPermanentError,
  nextBatch,
  readyEntries,
} from "./outbox";
import { isParked, type OutboxEntry } from "../types/sync";
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
  /**
   * `true` = niets houdt de wachtrij op: alles wat mocht is verstuurd.
   * Geparkeerde operaties (#10) en wat erachter wacht kunnen er nog staan.
   */
  ok: boolean;
  /** Foutmelding als een operatie faalde. */
  error: string | null;
  /** Aantal succesvol verwerkte operaties in deze run. */
  syncedCount: number;
  queuedCount: number;
  /** Aantal geparkeerde operaties in de wachtrij na de run (#10). */
  parkedCount: number;
  /** Outbox na de run (voor statusopbouw). */
  queue: OutboxEntry[];
}

export interface FlushOptions {
  /**
   * Ook de geparkeerde operaties opnieuw proberen (#10), elk één keer. Bij
   * een volledige sync (de pill `Probeer opnieuw`, de swipe, terugkeren naar
   * de app) en vóór het uitloggen; niet bij de automatische flush/backoff.
   */
  retryParked?: boolean;
}

export async function flushOutbox(
  userId: string,
  client: SupabaseClient<Database>,
  backend: StorageBackend,
  options: FlushOptions = {},
): Promise<FlushResult> {
  const stored = loadQueue(userId, backend);
  // Wachtende operaties eerst samenvoegen (§7.3): minder requests. De
  // samengevoegde wachtrij wordt meteen opgeslagen, zodat een afgebroken run
  // niet opnieuw met de oude, langere wachtrij begint.
  const queue = compactOutbox(stored);
  if (queue.length !== stored.length) saveQueue(userId, queue, backend);
  if (queue.length === 0) {
    return {
      ok: true,
      error: null,
      syncedCount: 0,
      queuedCount: 0,
      parkedCount: 0,
      queue,
    };
  }

  /**
   * Sleutels (item, lijst, volgorde) van geparkeerde operaties: wat daarvan
   * afhangt wacht erachter en gaat nooit blind de deur uit (#10).
   */
  const blocked = new Set<string>();
  const block = (entry: OutboxEntry): void => {
    for (const key of blockKeys(entry)) blocked.add(key);
  };
  const pending: OutboxEntry[] = [];
  for (const entry of queue) {
    if (isParked(entry) && !options.retryParked) block(entry);
    else pending.push(entry);
  }

  const done: OutboxEntry[] = [];
  /** Gefaalde operaties met hun nieuwe stand (gemarkeerd of geparkeerd). */
  const updated = new Map<string, OutboxEntry>();
  let syncedCount = 0;

  /**
   * De wachtrij na deze run, opgebouwd vanuit de wachtrij zoals die **nu** is:
   * verstuurde operaties eruit, de gefaalde bijgewerkt. Wat tijdens het
   * versturen is toegevoegd (of weggehaald, bv. door een verwijderde lijst)
   * blijft zo staan. Verstuurde operaties komen nooit terug in de wachtrij,
   * anders worden ze bij de retry dubbel verstuurd.
   */
  const settle = (): OutboxEntry[] => {
    const doneIds = new Set(done.map((entry) => entry.opId));
    const next = loadQueue(userId, backend)
      .filter((entry) => !doneIds.has(entry.opId))
      .map((entry) => updated.get(entry.opId) ?? entry);
    saveQueue(userId, next, backend);
    return next;
  };

  /**
   * Markeert `failed` (`attempts+1`, `lastError`, `lastCode`). Een operatie
   * die **alleen** verstuurd werd en blijvend geweigerd is, telt een
   * weigering (`rejections`); een tijdelijke fout zet die telling terug. Bij
   * `PARK_AFTER_ATTEMPTS` weigeringen op rij wordt hij geparkeerd. Een al
   * geparkeerde blijft geparkeerd; faalt hij alleen door de verbinding, dan
   * blijft de oorspronkelijke reden (`lastError`/`lastCode`) staan voor
   * diagnose. Geeft `true` als de run moet stoppen (FIFO): er is een gewone,
   * niet-geparkeerde fout.
   */
  const markFailed = (
    failed: readonly OutboxEntry[],
    result: ApplyResult,
  ): boolean => {
    const lastError = result.error ?? "Onbekende synchronisatiefout";
    // Uit een mislukte bundel is de schuldige rij niet bekend: nooit parkeren.
    const single = failed.length === 1;
    const permanent = isPermanentError(result.code);
    let stop = false;
    for (const entry of failed) {
      const rejections = !permanent
        ? 0
        : single
          ? (entry.rejections ?? 0) + 1
          : (entry.rejections ?? 0);
      const park =
        isParked(entry) || (single && rejections >= PARK_AFTER_ATTEMPTS);
      const keepReason = isParked(entry) && !permanent;
      const next: OutboxEntry = {
        ...entry,
        attempts: entry.attempts + 1,
        rejections,
        lastError: keepReason ? entry.lastError : lastError,
        lastCode: keepReason ? (entry.lastCode ?? null) : result.code,
      };
      if (park) next.parkedAt = entry.parkedAt ?? new Date().toISOString();
      updated.set(entry.opId, next);
      if (park) block(next);
      else stop = true;
    }
    return stop;
  };

  /**
   * Bewaart de wachtrij en de sync-meta en geeft het resultaat van de run.
   * `failure` = de fout die de run stopte. Blijven er geparkeerde operaties
   * over, dan is de run wel `ok` (niets houdt de rest op), maar geen schone
   * sync: de reden van de eerste geparkeerde wordt de fout en het tijdstip
   * van de laatste sync blijft staan.
   */
  const finish = (failure: string | null): FlushResult => {
    const nextQueue = settle();
    const parked = nextQueue.filter(isParked);
    const error =
      failure ??
      (parked.length > 0
        ? (parked[0]!.lastError ?? "Onbekende synchronisatiefout")
        : null);
    saveSyncMeta(
      userId,
      error === null
        ? { lastSyncedAt: new Date().toISOString(), lastError: null }
        : {
            lastSyncedAt: loadSyncMeta(userId, backend).lastSyncedAt,
            lastError: error,
          },
      backend,
    );
    return {
      ok: failure === null,
      error,
      syncedCount,
      // Meestal leeg; niet leeg als er iets geparkeerd is, iets wacht, of er
      // tijdens het versturen iets is gewijzigd (gaat met de volgende run mee).
      queuedCount: nextQueue.length,
      parkedCount: parked.length,
      queue: nextQueue,
    };
  };

  const succeeded = (entries: readonly OutboxEntry[]): void => {
    done.push(...entries);
    syncedCount += entries.length;
  };

  for (;;) {
    // Opeenvolgende creates/deletes gaan samen in één request (§7.3); wat
    // achter een geparkeerde operatie wacht, slaan we over (#10).
    const batch = nextBatch(readyEntries(pending, blocked));
    if (batch.length === 0) break;
    const sent = new Set(batch.map((entry) => entry.opId));
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (sent.has(pending[i]!.opId)) pending.splice(i, 1);
    }

    const result = await applyBatch(batch, userId, client);
    if (result.ok || isAlreadyCreated(batch, result)) {
      succeeded(batch);
      continue;
    }

    if (batch.length > 1 && result.code === UNIQUE_VIOLATION) {
      // Eén bestaande rij laat de hele insert mislukken. Los opnieuw versturen:
      // alleen de echte duplicaten vallen weg, de rest komt alsnog aan.
      for (const entry of batch) {
        const single = await applyEntry(entry, userId, client);
        if (single.ok || isAlreadyCreated([entry], single)) {
          succeeded([entry]);
          continue;
        }
        // Alleen deze markeren; de nog niet geprobeerde blijven ongemoeid.
        if (markFailed([entry], single)) return finish(single.error);
      }
      continue;
    }

    // Een mislukte bundel markeert al zijn operaties; ze blijven op hun plek
    // (de kop van wat nog moet), het verstuurde gaat eruit. Geparkeerd: door.
    if (markFailed(batch, result)) {
      return finish(result.error ?? "Onbekende synchronisatiefout");
    }
  }

  return finish(null);
}

/** Maximale wachttijd per server-actie voordat we de verbinding opgeven. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Een request met timeout (zie `withTimeout`). */
interface TimedRequest<T> {
  /** Het antwoord, of een "timeout"-fout als het niet op tijd kwam. */
  result: Promise<T>;
  /** Vervult zodra het request écht klaar is (ook na een timeout); reject nooit. */
  ended: Promise<void>;
}

/**
 * Start een request met een `AbortSignal` en een timeout (#8). Komt het
 * antwoord niet op tijd, dan wordt het request afgebroken (`abort()`) en
 * rejecten we met "timeout". Het request zelf blijft afhandelbaar (handlers
 * zijn attacht), dus nooit een unhandled rejection; zijn late antwoord wordt
 * genegeerd. `ended` laat zien wanneer het request echt gestopt is.
 */
function withTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  ms: number,
): TimedRequest<T> {
  const controller = new AbortController();
  const request = Promise.resolve().then(() => run(controller.signal));
  const ended = request.then(
    () => undefined,
    () => undefined,
  );
  const result = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, ms);
    request.then(
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
  return { result, ended };
}

/** Vervult met `true` als `promise` binnen `ms` klaar is, anders `false`. */
function endsWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Per client het laatst gestarte schrijfrequest (zijn `ended`). Een nieuw
 * request wacht daarop, zodat er nooit twee tegelijk lopen: ook niet als het
 * vorige een timeout kreeg en nog niet gestopt is (#8). Per client (niet
 * globaal), zodat een andere client — bv. in de tests — los staat.
 */
const lastWrite = new WeakMap<object, Promise<void>>();

/** Resultaat van één server-actie; reject nooit. */
interface ApplyResult {
  ok: boolean;
  /** Leesbare NL-tekst (§7.5), of `null` bij succes. */
  error: string | null;
  /** Postgres/PostgREST-foutcode als de server die gaf (bv. `23505`). */
  code: string | null;
  /** Ruwe servermelding, alleen om de constraint te herkennen; nooit tonen. */
  detail: string | null;
}

/** Postgres: unique-constraint geschonden. */
const UNIQUE_VIOLATION = "23505";

/** Primary key van de tabel waarin een create-operatie een rij aanmaakt. */
function primaryKeyOf(entry: OutboxEntry): string | null {
  if (entry.type === "item.create") return "list_items_pkey";
  if (entry.type === "list.create") return "lists_pkey";
  return null;
}

/**
 * Bestaat de rij van deze ene create al op de server (23505 op de primary
 * key)? Dan is een eerdere poging aangekomen (bv. na een timeout of een
 * gekilde app) en is de operatie gewoon gelukt. Andere constraints en fouten
 * tellen niet.
 */
function isAlreadyCreated(
  batch: readonly OutboxEntry[],
  result: ApplyResult,
): boolean {
  const [entry] = batch;
  if (batch.length !== 1 || !entry) return false;
  const pkey = primaryKeyOf(entry);
  return (
    pkey !== null &&
    result.code === UNIQUE_VIOLATION &&
    (result.detail?.includes(pkey) ?? false)
  );
}

/** Past één outbox-entry toe op Supabase. Reject NOOIT (AGENTS.md §7.5/D2). */
async function applyEntry(
  entry: OutboxEntry,
  userId: string,
  client: SupabaseClient<Database>,
): Promise<ApplyResult> {
  return guarded(client, (signal) =>
    applyToClient(entry, userId, client, signal),
  );
}

/** De rij van een `item.create` zoals `list_items` hem verwacht. */
function itemRow(entry: Extract<OutboxEntry, { type: "item.create" }>) {
  return {
    id: entry.item.id,
    list_id: entry.item.listId,
    text: entry.item.text,
    done: entry.item.done,
    position: entry.item.position,
  };
}

/**
 * Creates zijn idempotent (§7.3): bestaat de rij al, dan doet de server niets
 * (`ON CONFLICT (id) DO NOTHING`) en overschrijft hij hem ook niet. Een
 * herhaalde create na een timeout slaagt zo gewoon.
 */
const IGNORE_EXISTING = { onConflict: "id", ignoreDuplicates: true } as const;

/**
 * Past een groep operaties toe (zie `nextBatch`): één operatie zoals altijd,
 * meerdere `item.create` als één (idempotente) insert, meerdere `item.delete`
 * van één lijst als één delete. Reject nooit.
 */
async function applyBatch(
  batch: readonly OutboxEntry[],
  userId: string,
  client: SupabaseClient<Database>,
): Promise<ApplyResult> {
  const [first] = batch;
  if (!first) return { ok: true, error: null, code: null, detail: null };
  if (batch.length === 1) return applyEntry(first, userId, client);

  return guarded(client, async (signal) => {
    if (first.type === "item.create") {
      const rows = batch.flatMap((entry) =>
        entry.type === "item.create" ? [itemRow(entry)] : [],
      );
      const res = await client
        .from("list_items")
        .upsert(rows, IGNORE_EXISTING)
        .abortSignal(signal);
      return res.error;
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
        .eq("list_id", first.listId)
        .abortSignal(signal);
      return res.error;
    }
    // `nextBatch` bundelt niets anders; voor de zekerheid één voor één.
    for (const entry of batch) {
      const error = await applyToClient(entry, userId, client, signal);
      if (error) return error;
    }
    return null;
  });
}

/**
 * Voert een server-actie uit met timeout en leesbare NL-fout; reject nooit
 * (AGENTS.md §7.5/D2). Nooit twee schrijfrequests van één client tegelijk
 * (#8): eerst wachten tot het vorige gestopt is.
 */
async function guarded(
  client: SupabaseClient<Database>,
  run: (signal: AbortSignal) => PromiseLike<RawError>,
): Promise<ApplyResult> {
  // De plek in de rij meteen (synchroon) innemen, zodat een gelijktijdige
  // aanroep achter dit request aansluit en niet naast het vorige gaat lopen.
  const previous = lastWrite.get(client);
  let markEnded!: () => void;
  lastWrite.set(client, new Promise<void>((resolve) => (markEnded = resolve)));
  try {
    // Het vorige request kreeg bv. een timeout en is afgebroken, maar loopt
    // mogelijk nog (de server kan hem al verwerken). Niet een tweede kopie
    // ernaast starten: wachten tot hij stopt. Stopt hij ook niet binnen de
    // timeout, dan deze poging als timeout laten mislukken zonder te versturen;
    // de backoff probeert het later opnieuw.
    if (previous && !(await endsWithin(previous, REQUEST_TIMEOUT_MS))) {
      // Niets verstuurd: wie na ons komt, wacht nog steeds op het vorige.
      void previous.then(markEnded);
      throw new Error("timeout");
    }

    // D2-fix (fase D): een hangende network-request mag de flush nooit kunnen
    // blokkeren (anders blijft `runFlush` op "syncing" hangen). Na de timeout
    // wordt het request afgebroken, de entry als mislukt gemarkeerd en gaat
    // de backoff-cyclus verder.
    const { result, ended } = withTimeout(run, REQUEST_TIMEOUT_MS);
    void ended.then(markEnded);
    const error = await result;
    return error
      ? {
          ok: false,
          error: toUserFacingError(error),
          code: error.code ?? null,
          detail: error.message,
        }
      : { ok: true, error: null, code: null, detail: null };
  } catch (err) {
    // Netwerk weg (bv. `TypeError: Failed to fetch`) of timeout: supabase-js
    // gooit hier i.p.v. een error-object terug te geven. Map naar leesbare
    // NL-tekst; de rejection mag nooit doorslaan naar `flushOutbox`/`runFlush`.
    return {
      ok: false,
      error: toUserFacingError(err),
      code: null,
      detail: null,
    };
  }
}

type RawError = { message: string; code?: string } | null;

/**
 * Per client: bestaan de reorder-functies uit `supabase/reorder.sql`? `false`
 * zodra de server meldt dat ze er niet zijn; dan direct de terugval, zonder
 * eerst elke keer een mislukte aanroep. Per client (niet globaal), zodat een
 * andere client — bv. in de tests — opnieuw kijkt.
 */
const rpcAvailable = new WeakMap<object, boolean>();

/** De server kent de functie niet (nog niet uitgevoerd in Supabase). */
function isMissingFunction(error: RawError): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Volgorde opslaan via de databasefunctie: één request, alles of niets
 * (§7.3). Bestaat de functie (nog) niet, dan de oude manier: één update per
 * item. Zo werkt de app vóór én na het uitvoeren van het script.
 */
async function reorderViaRpc(
  client: SupabaseClient<Database>,
  viaRpc: () => PromiseLike<{ error: RawError }>,
  perRow: () => Promise<RawError>,
): Promise<RawError> {
  if (rpcAvailable.get(client) !== false) {
    const { error } = await viaRpc();
    if (!isMissingFunction(error)) {
      rpcAvailable.set(client, true);
      return error;
    }
    rpcAvailable.set(client, false);
  }
  return perRow();
}

/** Voert één outbox-entry uit; geeft de raw Supabase-fout terug (of null). */
async function applyToClient(
  entry: OutboxEntry,
  userId: string,
  client: SupabaseClient<Database>,
  signal: AbortSignal,
): Promise<RawError> {
  let error: RawError = null;

  switch (entry.type) {
    case "list.create": {
      // Bestaat de lijst al, dan blijft hij (en zijn titel) zoals hij is.
      const res = await client
        .from("lists")
        .upsert(
          {
            id: entry.listId,
            owner_id: userId,
            title: entry.title,
          },
          IGNORE_EXISTING,
        )
        .abortSignal(signal);
      error = res.error;
      break;
    }
    case "list.update": {
      const res = await client
        .from("lists")
        .update({ title: entry.title })
        .eq("id", entry.listId)
        .eq("owner_id", userId)
        .abortSignal(signal);
      error = res.error;
      break;
    }
    case "list.delete": {
      const res = await client
        .from("lists")
        .delete()
        .eq("id", entry.listId)
        .eq("owner_id", userId)
        .abortSignal(signal);
      error = res.error;
      break;
    }
    case "item.create": {
      const res = await client
        .from("list_items")
        .upsert(itemRow(entry), IGNORE_EXISTING)
        .abortSignal(signal);
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
        .eq("list_id", entry.item.listId)
        .abortSignal(signal);
      error = res.error;
      break;
    }
    case "item.delete": {
      const res = await client
        .from("list_items")
        .delete()
        .eq("id", entry.itemId)
        .abortSignal(signal);
      error = res.error;
      break;
    }
    case "list.reorder": {
      error = await reorderViaRpc(
        client,
        () =>
          client
            .rpc("reorder_lists", { p_list_ids: entry.listIds })
            .abortSignal(signal),
        async () => {
          const updates = entry.listIds.map((listId, position) =>
            client
              .from("lists")
              .update({ position })
              .eq("id", listId)
              .eq("owner_id", userId)
              .abortSignal(signal),
          );
          const results = await Promise.all(updates);
          return results.find((r) => r.error)?.error ?? null;
        },
      );
      break;
    }
    case "item.reorder": {
      error = await reorderViaRpc(
        client,
        () =>
          client
            .rpc("reorder_items", {
              p_list_id: entry.listId,
              p_item_ids: entry.itemIds,
            })
            .abortSignal(signal),
        async () => {
          const updates = entry.itemIds.map((itemId, position) =>
            client
              .from("list_items")
              .update({ position })
              .eq("id", itemId)
              .eq("list_id", entry.listId)
              .abortSignal(signal),
          );
          const results = await Promise.all(updates);
          return results.find((r) => r.error)?.error ?? null;
        },
      );
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
    // Na de timeout wordt het request ook afgebroken (#8).
    const { data, error } = await withTimeout(
      (signal) =>
        client
          .from("lists")
          .select(
            "id,title,created_at,list_items(id,list_id,text,done,position,created_at)",
          )
          .eq("owner_id", userId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: false })
          .abortSignal(signal),
      REQUEST_TIMEOUT_MS,
    ).result;

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
