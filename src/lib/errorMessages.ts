/**
 * Fout -> leesbare Nederlandse tekst (AGENTS.md §7.5).
 *
 * Regel: een `TypeError`, stack trace of Engelse databasefout mag nooit
 * zichtbaar zijn voor de gebruiker. Onbekende fouten vallen daarom altijd terug
 * op een vaste, generieke Nederlandse tekst.
 */

/** Vangwoorden waarmee we herkennen welke NL-tekst een fout verdient. */
type Rule = {
  /** Vergelijking is case-insensitive. */
  test: readonly string[];
  message: string;
};

/** Melding voor een ongeldige, gebruikte of verlopen uitnodiging. */
export const INVITE_INVALID = "Deze uitnodiging is ongeldig of verlopen.";

/** Melding wanneer de uitnodiging voor een ander e-mailadres geldt. */
export const INVITE_WRONG_EMAIL =
  "Deze uitnodiging is voor een ander e-mailadres.";

/** Nog niet herkende netwerkfout (offline/onderbreking). */
export const NETWORK_ERROR =
  "Geen verbinding met de server. Probeer het opnieuw.";

/** Request is afgebroken of je ging de timeout voorbij. */
export const CONNECTION_DROPPED =
  "De verbinding viel weg. Probeer het opnieuw.";

/** RLS of een andere permissie weigerde de query. */
export const ACCESS_DENIED = "Geen toegang tot deze gegevens.";

/** Een entiteit bestaat al (unique-constraint). */
export const DUPLICATE_ERROR = "Dit item bestaat al.";

/** Vangnet voor onbekende synchronisatiefouten (AGENTS.md §7.5). */
export const SYNC_GENERIC_ERROR =
  "Synchronisatie mislukt. Probeer het opnieuw.";

/** Vangnet voor onbekende auth-fouten (past beter dan de sync-tekst). */
export const AUTH_GENERIC_ERROR = "Er ging iets mis. Probeer het opnieuw.";

/** Netwerk/transportfouten tijdens de sync. */
const NETWORK_RULES: readonly Rule[] = [
  {
    test: [
      "failed to fetch",
      "networkerror",
      "network request failed",
      "fetch failed",
      "load failed",
      "typeerror",
    ],
    message: NETWORK_ERROR,
  },
  {
    test: ["abort", "aborted", "timeout", "timed out", "request timeout"],
    message: CONNECTION_DROPPED,
  },
];

/** RLS/permissie-fouten (de tweede beveiligingslaag moet stil blijven). */
const PERMISSION_RULES: readonly Rule[] = [
  {
    test: [
      "permission denied",
      "permission",
      "row-level security",
      "rls",
      "forbidden",
      "not permitted",
      "new row violates",
    ],
    message: ACCESS_DENIED,
  },
];

/** Duplicaat/unique-constraint. */
const DUPLICATE_RULES: readonly Rule[] = [
  {
    test: [
      "duplicate key",
      "duplicate entry",
      "duplicate",
      "unique constraint",
      "already exists",
      "23505",
    ],
    message: DUPLICATE_ERROR,
  },
];

const SYNC_RULES: readonly Rule[] = [
  ...NETWORK_RULES,
  ...PERMISSION_RULES,
  ...DUPLICATE_RULES,
];

const AUTH_RULES: readonly Rule[] = [
  {
    test: [
      "no_active_invite",
      "invalid login credentials",
      "user_already_exists",
      "already registered",
      "already been registered",
    ],
    message: "De inloggegevens of uitnodiging zijn onjuist.",
  },
  {
    test: [
      "password should be at least",
      "password is too short",
      "weak password",
    ],
    message: "Kies een wachtwoord van minimaal 6 tekens.",
  },
  {
    test: ["unable to validate email", "invalid email"],
    message: "Vul een geldig e-mailadres in.",
  },
  {
    test: [
      "email rate limit",
      "rate limit",
      "too many requests",
      "security purposes",
    ],
    message:
      "Er zijn te veel verzoeken verstuurd. Probeer het later opnieuw, of vraag een nieuwe uitnodiging aan.",
  },
  {
    test: ["expired", "token has expired"],
    message: "Deze uitnodiging is ongeldig of verlopen.",
  },
];

/**
 * Map een willekeurige fout naar leesbare NL-tekst voor de **sync-laag**
 * (AGENTS.md §7.5, fase D4).
 *
 * Let op: `err.message` van een onbekend type wordt nooit direct getoond; het
 * wordt alleen gebruikt om een bekende situatie te herkennen.
 */
export function toUserFacingError(error: unknown): string {
  // Een TypeError is vrijwel altijd een netwerkfout ('Failed to fetch') die
  // postgrest-js gooit als de verbinding wegvalt — ook zonder tekst-match.
  if (error instanceof TypeError) return NETWORK_ERROR;

  const text = extractMessage(error).toLowerCase();
  if (!text) return SYNC_GENERIC_ERROR;

  for (const rule of SYNC_RULES) {
    if (rule.test.some((needle) => text.includes(needle))) return rule.message;
  }
  return SYNC_GENERIC_ERROR;
}

/**
 * Specifiek voor de auth-laag: kent ook de triggerfout van de uitnodiging.
 * `no_active_invite` betekent dat er geen geldige claim + uitnodiging was, of dat
 * de uitnodiging al gebruikt of verlopen is. Dat is één melding voor de gebruiker.
 */
export function toAuthErrorMessage(error: unknown): string {
  const text = extractMessage(error).toLowerCase();

  if (text.includes("no_active_invite")) return INVITE_INVALID;
  if (text.includes("invite")) return INVITE_INVALID;

  for (const rule of AUTH_RULES) {
    if (rule.test.some((needle) => text.includes(needle))) return rule.message;
  }
  // Netwerkfouten herkennen we ook in de auth-laag (bv. bij signUp/signIn).
  for (const rule of NETWORK_RULES) {
    if (rule.test.some((needle) => text.includes(needle))) return rule.message;
  }
  return AUTH_GENERIC_ERROR;
}

/**
 * Haal een bruikbare tekst uit een onbekende fout. Supabase geeft een `message`,
 * maar een `TypeError` of een netwerkfout heeft er soms geen of een
 * technische.
 *
 * Let op: de triggerfout `no_active_invite` komt als `code`, terwijl de
 * `message` dan alleen "Database error saving new user" zegt. Daarom lezen we
 * beide velden.
 */
function extractMessage(error: unknown): string {
  if (error === null || error === undefined) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const record = error as {
      message?: unknown;
      code?: unknown;
      error_description?: unknown;
    };

    const parts: string[] = [];
    for (const field of [
      record.code,
      record.message,
      record.error_description,
    ]) {
      if (typeof field === "string" && field) parts.push(field);
    }
    return parts.join(" ");
  }
  return "";
}
