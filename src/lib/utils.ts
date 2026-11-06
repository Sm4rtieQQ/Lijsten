/** Uniek id genereren (UUID waar mogelijk, anders tijd + random). */
export function createId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Vergelijkt de ingevoerde titel met de werkelijke lijsttitel.
 *
 * Regel uit AGENTS.md §8.3: de vergelijking is **exact** en
 * **hoofdlettergevoelig**, na `trim()`. Dus "boodschappen" matcht niet met
 * "Boodschappen", maar "  Boodschappen  " wel.
 */
export function isExactTitleMatch(input: string, title: string): boolean {
  return input.trim() === title;
}

/**
 * Drag & drop: verplaatst `fromId` naar de plek van `toId`. Geeft `null` als er
 * niets te verplaatsen valt (zelfde id of onbekend id).
 */
export function moveId(
  ids: readonly string[],
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return null;
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) return null;
  const next = [...ids];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, fromId);
  return next;
}
