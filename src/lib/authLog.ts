import { browserStorage, type StorageBackend } from "./storage";

/**
 * Korte ring buffer van auth-events (`onAuthStateChange`), om achteraf te kunnen
 * zien waarom iemand uitgelogd werd. Bewust zonder tokens, e-mailadressen of
 * gebruikers-id's: alleen eventnaam, tijdstip en of het uitloggen van de
 * gebruiker zelf kwam. Daarom één globale key (er is hier geen per-user data;
 * een SIGNED_OUT heeft bovendien geen gebruiker meer).
 */
export const AUTH_LOG_KEY = "lijstjes:authlog";
export const AUTH_LOG_MAX = 20;

export interface AuthLogEntry {
  /** ISO-tijdstip. */
  at: string;
  /** Eventnaam van supabase-js (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT, ...). */
  event: string;
  /** `true` = de gebruiker koos zelf voor uitloggen (alleen betekenisvol bij SIGNED_OUT). */
  userInitiated: boolean;
}

function isEntry(value: unknown): value is AuthLogEntry {
  if (value === null || typeof value !== "object") return false;
  const e = value as Partial<AuthLogEntry>;
  return (
    typeof e.at === "string" &&
    typeof e.event === "string" &&
    typeof e.userInitiated === "boolean"
  );
}

export function readAuthLog(
  backend: StorageBackend = browserStorage,
): AuthLogEntry[] {
  try {
    const raw = backend.getItem(AUTH_LOG_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Voegt een entry toe en houdt de laatste `AUTH_LOG_MAX`. Faalt stil: logging mag de app nooit breken. */
export function appendAuthLog(
  event: string,
  userInitiated: boolean,
  backend: StorageBackend = browserStorage,
  now: Date = new Date(),
): void {
  try {
    const next = [
      ...readAuthLog(backend),
      { at: now.toISOString(), event, userInitiated },
    ].slice(-AUTH_LOG_MAX);
    backend.setItem(AUTH_LOG_KEY, JSON.stringify(next));
  } catch {
    // Opslag vol of geblokkeerd: de log is een hulpmiddel, geen vereiste.
  }
}
