/**
 * Uitnodigingstoken uit een URL lezen (AGENTS.md §8.11).
 *
 * Bewust een pure module zonder imports: geen Vue, geen Supabase. Zo is de
 * parser los te testen zonder de app te mounten, en blijft er één plek die de
 * drie bronnen (deep link, `?invite=`, `#invite=`) kent.
 */

/** Het scheme uit `strings.xml`; dit is geen webadres. */
export const APP_SCHEME = "com.lijstjes.app";

/**
 * Alle query- en hash-parameters van een URL als een eenvoudige map.
 *
 * Waarom niet `new URL` + `searchParams`: bij een custom scheme
 * (`com.lijstjes.app://invite?token=…`) leest de WHATWG-parser alles achter
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
 * Haal de uitnodigingstoken uit een URL. Geeft `null` terug als er geen leesbare
 * token in zit. Raakt de originele string niet aan.
 *
 * Geaccepteerde bronnen:
 * - `com.lijstjes.app://invite?token=ABC` (native deep link)
 * - `http://localhost:5173/?invite=ABC` (web, `npm run dev`)
 * - `http://localhost:5173/#invite=ABC` (web, hash-variant)
 */
export function extractInviteToken(url: string): string | null {
  const params = readParams(url);

  // Webvarianten en de `?invite=` van de beheerderlink.
  const direct = params.get("invite");
  if (direct) return direct;

  // Native: het pad is `invite`, de parameter heet `token`.
  const fromToken = params.get("token");
  if (fromToken && url.includes(`${APP_SCHEME}://invite`)) return fromToken;

  return null;
}

/**
 * Is dit de herstel-link van Supabase?
 *
 * Met `redirectTo: "com.lijstjes.app://"` komt de mail terug als
 * `com.lijstjes.app://#access_token=…&type=recovery`. De herkenning loopt daarom
 * op de inhoud en niet op het pad: het pad is niet gegarandeerd.
 */
export function isRecoveryUrl(url: string): boolean {
  const params = readParams(url);
  if (params.get("type") === "recovery") return true;
  return Boolean(
    params.get("access_token") &&
    params.get("refresh_token") &&
    url.includes("#"),
  );
}

/**
 * Haal het token-stuk uit een URL, zodat het niet in de URL-balk of de historie
 * achterblijft. Overige query-parameters blijven staan.
 */
export function scrubInviteToken(url: string): string {
  return url
    .replace(/([?&#])invite=[^&#]*/, "$1")
    .replace(/([?&#])token=[^&#]*/, "$1")
    .replace(/[?&]+$/, "")
    .replace(/#$/, "");
}
