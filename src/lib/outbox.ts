import {
  hasFailed,
  isParked,
  type OutboxEntry,
  type OutboxOpPayload,
} from "../types/sync";
import { CONNECTION_DROPPED, NETWORK_ERROR } from "./errorMessages";
import { createId } from "./utils";

/**
 * Voegt wachtende operaties samen vlak vóór het versturen (§7.3), zodat er
 * minder requests nodig zijn. FIFO en afhankelijkheden blijven kloppen:
 *
 * - item aangemaakt, daarna gewijzigd → één `item.create` met de eindstand;
 * - item meerdere keren gewijzigd → alleen de laatste `item.update`;
 * - item aangemaakt en weer verwijderd → beide weg (de server zag het nooit);
 * - lijst aangemaakt en hernoemd → één `list.create` met de laatste titel;
 *   meerdere `list.update` → alleen de laatste;
 * - meerdere `item.reorder` van één lijst / meerdere `list.reorder` → alleen
 *   de laatste, op de plek van de laatste (dus ná de creates die hij noemt).
 *
 * Alleen operaties die **nog nooit geprobeerd** zijn worden samengevoegd of
 * geschrapt. Een gefaalde operatie kan na een timeout tóch op de server zijn
 * aangekomen; die blijft daarom ongemoeid en niets wordt erin opgevouwen.
 * Puur: de invoer wordt niet gewijzigd.
 */
export function compactOutbox(queue: readonly OutboxEntry[]): OutboxEntry[] {
  const out: (OutboxEntry | null)[] = [];
  const fresh = (entry: OutboxEntry | null | undefined): boolean =>
    !!entry && !hasFailed(entry);
  /** Index in `out` van de laatste nog niet geprobeerde operatie met deze sleutel. */
  const last = new Map<string, number>();

  const remember = (key: string, entry: OutboxEntry): void => {
    last.set(key, out.length);
    out.push(entry);
  };
  const lookup = (key: string): number | undefined => {
    const index = last.get(key);
    return index !== undefined && fresh(out[index]) ? index : undefined;
  };
  const drop = (key: string): void => {
    const index = lookup(key);
    if (index !== undefined) out[index] = null;
    last.delete(key);
  };

  for (const entry of queue) {
    if (!fresh(entry)) {
      out.push(entry); // gefaald: precies zo laten staan
      continue;
    }
    switch (entry.type) {
      case "item.create":
        remember(`item.create:${entry.item.id}`, entry);
        break;
      case "item.update": {
        const created = lookup(`item.create:${entry.item.id}`);
        const target = created !== undefined ? out[created] : null;
        if (target?.type === "item.create") {
          out[created!] = { ...target, item: entry.item };
          break;
        }
        drop(`item.update:${entry.item.id}`);
        remember(`item.update:${entry.item.id}`, entry);
        break;
      }
      case "item.delete": {
        drop(`item.update:${entry.itemId}`);
        if (lookup(`item.create:${entry.itemId}`) !== undefined) {
          drop(`item.create:${entry.itemId}`);
          break; // nooit op de server geweest: niets te verwijderen
        }
        out.push(entry);
        break;
      }
      case "list.create":
        remember(`list.create:${entry.listId}`, entry);
        break;
      case "list.update": {
        const created = lookup(`list.create:${entry.listId}`);
        const target = created !== undefined ? out[created] : null;
        if (target?.type === "list.create") {
          out[created!] = { ...target, title: entry.title };
          break;
        }
        drop(`list.update:${entry.listId}`);
        remember(`list.update:${entry.listId}`, entry);
        break;
      }
      case "item.reorder":
        drop(`item.reorder:${entry.listId}`);
        remember(`item.reorder:${entry.listId}`, entry);
        break;
      case "list.reorder":
        drop("list.reorder");
        remember("list.reorder", entry);
        break;
      default:
        out.push(entry);
    }
  }

  return out.filter((entry): entry is OutboxEntry => entry !== null);
}

/** Maximaal zoveel operaties in één gebundeld request. */
export const MAX_BATCH_SIZE = 100;

/** Fouten die aan de verbinding lagen, niet aan de operatie zelf. */
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set([
  NETWORK_ERROR,
  CONNECTION_DROPPED,
]);

/**
 * Nog nooit geprobeerd, of alleen mislukt door de verbinding. Een geparkeerde
 * operatie (#10) gaat altijd alleen.
 */
function isBatchable(entry: OutboxEntry): boolean {
  if (isParked(entry)) return false;
  return (
    !hasFailed(entry) ||
    (entry.lastError !== null && TRANSIENT_ERRORS.has(entry.lastError))
  );
}

/**
 * De volgende groep operaties die samen in één request kan (§7.3), vanaf de
 * kop van `pending` (FIFO blijft dus gelden):
 * - opeenvolgende `item.create` → één insert met alle rijen;
 * - opeenvolgende `item.delete` van dezelfde lijst → één delete.
 * Al het andere gaat alleen. Een operatie die de **server** al eens weigerde
 * (duplicaat, geen toegang, onbekende fout) gaat ook alleen, zodat één
 * probleemgeval niet een hele bundel laat mislukken. Na een netwerkfout of
 * timeout mag een operatie wél weer mee in een bundel — anders zou na een
 * offline periode alles los worden verstuurd.
 */
export function nextBatch(pending: readonly OutboxEntry[]): OutboxEntry[] {
  const first = pending[0];
  if (!first) return [];
  const batch: OutboxEntry[] = [first];
  if (!isBatchable(first)) return batch;

  const fits = (entry: OutboxEntry): boolean => {
    if (!isBatchable(entry)) return false;
    if (first.type === "item.create") return entry.type === "item.create";
    if (first.type === "item.delete") {
      return entry.type === "item.delete" && entry.listId === first.listId;
    }
    return false;
  };

  for (let i = 1; i < pending.length && batch.length < MAX_BATCH_SIZE; i += 1) {
    const entry = pending[i];
    if (!entry || !fits(entry)) break;
    batch.push(entry);
  }
  return batch;
}

/** Maakt van een operatie een outbox-entry (nieuw `opId`, nog niet geprobeerd). */
export function createOutboxEntry(
  op: OutboxOpPayload,
  now: Date = new Date(),
): OutboxEntry {
  const entry: OutboxEntry = {
    ...op,
    opId: createId(),
    createdAt: now.toISOString(),
    attempts: 0,
    lastError: null,
  };
  return entry;
}

/** Hoort deze operatie bij lijst `listId` (de lijst zelf of een van haar items)? */
export function touchesList(entry: OutboxEntry, listId: string): boolean {
  switch (entry.type) {
    case "item.create":
    case "item.update":
      return entry.item.listId === listId;
    case "list.reorder":
      return entry.listIds.includes(listId);
    default:
      return entry.listId === listId;
  }
}

/**
 * Outbox zonder de operaties van een te verwijderen lijst. Anders volgen er na
 * `list.delete` nog FK-fouten, of worden er nét verwijderde items herschapen.
 */
export function pruneQueueForList(
  queue: readonly OutboxEntry[],
  listId: string,
): OutboxEntry[] {
  return queue.filter((entry) => !touchesList(entry, listId));
}

/**
 * Volgende poging voor de backoff: één hoger dan de hoogste `attempts`.
 * Geparkeerde operaties tellen niet mee: die gaan niet automatisch opnieuw.
 */
export function nextRetryAttempt(queue: readonly OutboxEntry[]): number {
  const active = queue.filter((entry) => !isParked(entry));
  return Math.max(0, ...active.map((entry) => entry.attempts)) + 1;
}

/**
 * Na zoveel blijvende weigeringen **op rij** (`rejections`, tijdelijke fouten
 * tellen niet en zetten de telling terug) wordt een operatie geparkeerd (#10,
 * §7.3). Niet meteen bij de eerste weigering: dan kan een toevallige race
 * (bv. met een net verwijderde lijst op een ander apparaat) zich nog oplossen.
 */
export const PARK_AFTER_ATTEMPTS = 3;

/**
 * Weigert de server deze operatie zelf (permanent), of lag het aan de
 * verbinding/de server (tijdelijk)? Alleen een permanente fout mag tot
 * parkeren leiden (#10).
 *
 * - Permanent: Postgres-klassen `22` (ongeldige data), `23` (integriteit, bv.
 *   `23503` FK, `23505` andere constraint), `42` (bv. `42501` RLS) en `P0`
 *   (fout uit een databasefunctie); PostgREST `PGRST1xx`/`PGRST2xx` (het
 *   verzoek klopt niet, 4xx).
 * - Tijdelijk: geen code (netwerk, timeout), PostgREST `PGRST0xx` (geen
 *   verbinding met de database) en `PGRST3xx` (JWT verlopen: na het verversen
 *   van de sessie lukt het weer), en alles wat we niet kennen.
 */
export function isPermanentError(code: string | null | undefined): boolean {
  if (!code) return false;
  if (code.startsWith("PGRST")) {
    const group = code.charAt(5);
    return group === "1" || group === "2";
  }
  return ["22", "23", "42", "P0"].includes(code.slice(0, 2));
}

/**
 * Sleutels waarop een geparkeerde (of wachtende) operatie de operaties ná hem
 * laat wachten: het item of de lijst die hij schrijft, of de volgorde die hij
 * zet. Een item-operatie blokkeert alleen dat item, niet de hele lijst.
 */
export function blockKeys(entry: OutboxEntry): string[] {
  switch (entry.type) {
    case "item.create":
    case "item.update":
      return [`item:${entry.item.id}`];
    case "item.delete":
      return [`item:${entry.itemId}`];
    case "item.reorder":
      return [`order:${entry.listId}`];
    case "list.reorder":
      return ["order:lists"];
    default:
      return [`list:${entry.listId}`];
  }
}

/** Sleutels waarvan deze operatie afhangt (zie `blockKeys`). */
function dependsOn(entry: OutboxEntry): string[] {
  switch (entry.type) {
    case "item.create":
    case "item.update":
      return [`item:${entry.item.id}`, `list:${entry.item.listId}`];
    case "item.delete":
      return [`item:${entry.itemId}`, `list:${entry.listId}`];
    case "item.reorder":
      return [
        `order:${entry.listId}`,
        `list:${entry.listId}`,
        ...entry.itemIds.map((id) => `item:${id}`),
      ];
    case "list.reorder":
      return ["order:lists", ...entry.listIds.map((id) => `list:${id}`)];
    default:
      return [`list:${entry.listId}`];
  }
}

/**
 * De operaties uit `pending` die nu verstuurd mogen worden (#10), in
 * FIFO-volgorde. Een operatie die afhangt van een geblokkeerde sleutel (een
 * geparkeerde operatie op hetzelfde item, een geparkeerde lijst-operatie, …)
 * wacht, en laat op haar beurt wat van háár afhangt ook wachten. Wachten is
 * niet opgeslagen: lukt de geparkeerde operatie later, dan gaan ze vanzelf
 * mee. Puur: `blocked` wordt niet gewijzigd.
 */
export function readyEntries(
  pending: readonly OutboxEntry[],
  blocked: ReadonlySet<string>,
): OutboxEntry[] {
  const held = new Set(blocked);
  const ready: OutboxEntry[] = [];
  for (const entry of pending) {
    if (dependsOn(entry).some((key) => held.has(key))) {
      for (const key of blockKeys(entry)) held.add(key);
    } else {
      ready.push(entry);
    }
  }
  return ready;
}
