/** Uniek id genereren (UUID waar mogelijk, anders tijd + random). */
export function createId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isIsoDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
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
