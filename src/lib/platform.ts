/**
 * Platformdetectie en redirect-doelen voor de bevestigings- en herstelmail
 * (AGENTS.md §7.6, §8.11, §10.3).
 */

/** Het app-scheme; hetzelfde als `custom_url_scheme` in `strings.xml`. */
export const APP_SCHEME = "com.lijstjes.app";

/** Ligt de app binnen Capacitor (dus niet in een gewone browser)? */
export function isNativePlatform(): boolean {
  const cap = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Doel van de web-redirect: origin **plus** pad van de huidige pagina.
 *
 * Alleen de origin is te weinig wanneer de app onder een subpad draait — zoals de
 * GitHub Pages-projectpagina `/Lijsten/` — want dan wijst de mail naar de root
 * (404). Leeg in omgevingen zonder `location` (bv. Node).
 */
export function webRedirectTarget(
  location: { origin?: string; pathname?: string } | undefined,
): string | null {
  if (!location?.origin) return null;
  return `${location.origin}${location.pathname ?? ""}`;
}

/**
 * Waar Supabase de bevestigings- en herstelmail naartoe stuurt.
 *
 * Native: het eigen scheme `com.lijstjes.app://` (deep link, AGENTS.md §8.11).
 * Web: de volledige pagina-URL, zodat registreren en bevestigen zowel in
 * `npm run dev` als op de GitHub Pages-projectpagina blijft werken (AGENTS.md §10.3).
 */
export function emailRedirectTo(): string {
  if (isNativePlatform()) return `${APP_SCHEME}://`;
  const target =
    typeof window !== "undefined" ? webRedirectTarget(window.location) : null;
  return target ?? `${APP_SCHEME}://`;
}
