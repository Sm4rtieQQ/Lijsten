import { onBeforeUnmount } from "vue";

import {
  isRecoveryUrl,
  isSignupConfirmationUrl,
  readParams,
  stripUrlHash,
} from "../lib/urlParams";
import { supabase } from "../lib/supabase";
import { setJustVerified, setRecovery } from "./useAuth";

/**
 * Deep link + webvariant van de e-mailbevestiging en de herstel-link
 * (AGENTS.md §8.11).
 *
 * Er is geen webhost: de app draait als Android-app. De bevestigings- en
 * herstellink komen binnen via het eigen scheme `com.lijstjes.app://` en worden
 * door Android als intent afgegeven. Omdat Supabase standaard de `implicit`-flow
 * gebruikt, zit het tokenpaar in de hash (`#access_token=…&refresh_token=…`) en
 * het soort link in `type` (`signup` of `recovery`).
 *
 * Het pure URL-lezen staat in `lib/urlParams.ts`; hier staat alleen de
 * afhandeling. De tokens worden nooit in `localStorage` bewaard en nooit gelogd.
 */

const pendingHandles: Array<{ remove: () => Promise<void> }> = [];

/** Alleen voor tests: reset de module-state. */
export function __resetDeepLinkState(): void {
  setRecovery(false);
  setJustVerified(false);
}

/** Ligt de app binnen Capacitor (dus niet in een gewone browser)? */
function isNativePlatform(): boolean {
  const cap = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Verwerk een binnengekomen URL.
 *
 * De tokens zitten in de hash. Die halen we zelf op en zetten we er een sessie
 * mee: `setSession` is de enige publieke API hiervoor en vuurt daarna
 * `SIGNED_IN`, niet `PASSWORD_RECOVERY`. Daarom zetten we de juiste vlag zelf op
 * `true` in plaats van op het event te wachten.
 *
 * Bij een bevestigingslink (`type=signup`) weten we dat dit géén herstel-link
 * is: zonder dat onderscheid zou een bevestigingslink ten onrechte naar
 * `ResetPasswordView` leiden.
 */
export async function handleIncomingUrl(url: string): Promise<void> {
  const recoveryUrl = isRecoveryUrl(url);
  const signupUrl = isSignupConfirmationUrl(url);
  if (!recoveryUrl && !signupUrl) return;

  const params = readParams(url);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) return;
  if (!supabase) return;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return;

  if (recoveryUrl) setRecovery(true);
  else setJustVerified(true);
}

async function onLaunchUrl(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    const launch = await App.getLaunchUrl();
    if (launch?.url) await handleIncomingUrl(launch.url);
  } catch {
    // Geen launcher of plugin niet beschikbaar: de app start gewoon zonder link.
  }
}

async function registerListener(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    const handle = await App.addListener("appUrlOpen", ({ url }) => {
      void handleIncomingUrl(url);
    });
    pendingHandles.push(handle);
  } catch {
    // Zonder listener werkt de app, alleen geen deep links.
  }
}

/**
 * Start het opvragen van de launch-URL en de `appUrlOpen`-listener. Beide zijn
 * nodig: `getLaunchUrl` voor een cold start, de listener als de app al draait.
 * Aanroepen vanuit `App.vue`, niet vanuit deze composable (zie AGENTS.md §5).
 */
export function initDeepLink(): void {
  // Webvariant en cold start: kijk altijd eerst naar de huidige URL.
  readCurrentLocation();

  if (!isNativePlatform()) return;
  void onLaunchUrl();
  void registerListener();
}

/**
 * Lees een bevestigings-/herstel-link uit de huidige URL van de WebView en haal
 * de tokens er meteen uit. Ze mogen niet in de URL-balk, de historie of een
 * screenshot achterblijven.
 */
function readCurrentLocation(): void {
  if (typeof window === "undefined") return;
  const current = window.location.href;
  if (!isRecoveryUrl(current) && !isSignupConfirmationUrl(current)) return;

  try {
    window.history.replaceState({}, "", stripUrlHash(current));
  } catch {
    // Sommige omgevingen blokkeren replaceState; de app blijft werken.
  }

  void handleIncomingUrl(current);
}

/** Verwijder de `appUrlOpen`-listener. Aanroepen vanuit `App.vue`. */
export function disposeDeepLink(): void {
  while (pendingHandles.length > 0) {
    const handle = pendingHandles.pop();
    void handle?.remove();
  }
}

export function useDeepLink() {
  onBeforeUnmount(disposeDeepLink);

  return {
    /** Handmatig een URL verwerken (webvariant en tests). */
    handleIncomingUrl,
  };
}
