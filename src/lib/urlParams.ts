/**
 * Pure URL-lezer voor deep links en de webvariant (AGENTS.md §8.11).
 *
 * Bewust een pure module zonder imports: geen Vue, geen Supabase. Zo is de
 * parser los te testen zonder de app te mounten. Er komt geen
 * uitnodigingslogica meer in: alleen de bevestigings- en herstel-link van
 * Supabase.
 */

/**
 * Alle query- en hash-parameters van een URL als een eenvoudige map.
 *
 * Waarom niet `new URL` + `searchParams`: bij een custom scheme
 * (`com.lijstjes.app://#access_token=…`) leest de WHATWG-parser alles achter
 * `//` als host en blijft `searchParams` leeg. Daarom de ruwe string slaan.
 */
export function readParams(url: string): Map<string, string> {
  const params = new Map<string, string>();

  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");

  const push = (part: string): void => {
    if (!part) return;
    for (const pair of part.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? "" : pair.slice(eq + 1);
      if (!key) continue;
      try {
        params.set(key, decodeURIComponent(value));
      } catch {
        params.set(key, value);
      }
    }
  };

  if (queryStart !== -1) {
    const end = hashStart === -1 ? url.length : hashStart;
    push(url.slice(queryStart + 1, end));
  }
  if (hashStart !== -1) push(url.slice(hashStart + 1));

  return params;
}

/**
 * Is dit de herstel-link van Supabase?
 *
 * Met `redirectTo: "com.lijstjes.app://"` komt de mail terug als
 * `com.lijstjes.app://#access_token=…&type=recovery`. De herkenning loopt op de
 * `type`-parameter, niet op het pad: het pad is niet gegarandeerd.
 */
export function isRecoveryUrl(url: string): boolean {
  return readParams(url).get("type") === "recovery";
}

/**
 * Is dit de bevestigings-link van een nieuwe account (`Confirm email`)?
 *
 * Alleen dan mag de app de sessie opzetten en de groene bevestiging tonen.
 * Zonder het onderscheid met `type` zou een bevestigingslink ten onrechte als
 * herstel-link behandeld worden.
 */
export function isSignupConfirmationUrl(url: string): boolean {
  const params = readParams(url);
  const type = params.get("type");
  const hasTokens = Boolean(
    params.get("access_token") && params.get("refresh_token"),
  );
  return (type === "signup" || type === "email_change") && hasTokens;
}

/**
 * Haal het hash-stuk uit een URL, zodat het tokenpaar niet in de URL-balk of de
 * historie achterblijft. Query-parameters blijven staan.
 */
export function stripUrlHash(url: string): string {
  const hashStart = url.indexOf("#");
  const withoutHash = hashStart === -1 ? url : url.slice(0, hashStart);
  return withoutHash.replace(/[?&]+$/, "");
}
