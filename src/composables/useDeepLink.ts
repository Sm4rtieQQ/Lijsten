import { onBeforeUnmount, ref, type Ref } from "vue";

import {
  extractInviteToken,
  isRecoveryUrl,
  readParams,
  scrubInviteToken,
} from "../lib/inviteToken";
import { supabase } from "../lib/supabase";
import { setRecovery } from "./useAuth";

/**
 * Deep link + web-variant van de registratie-uitnodiging en de herstel-link
 * (AGENTS.md §8.11).
 *
 * Er is geen webhost: de app draait als Android-app. Een uitnodiging komt binnen
 * als `com.lijstjes.app://invite?token=…` en wordt door Android als intent
 * afgegeven. Voor webontwikkeling blijven `?invite=` en `#invite=` bestaan, zodat
 * registratie in `npm run dev` te testen is.
 *
 * Het pure URL-lezen staat in `lib/inviteToken.ts`; hier staat alleen de
 * afhandeling. De uitnodigingstoken wordt nooit in `localStorage` bewaard en
 * nooit gelogd. Bij een deep link komt hij bovendien niet in de URL van de
 * WebView terecht: hij wordt uit het intent gelezen en daarna weggegooid.
 */

/** Pad waarmee Supabase de herstel-link terugstuurt. */
const RECOVERY_PATH = "auth/callback";

const inviteToken: Ref<string | null> = ref(null);

const pendingHandles: Array<{ remove: () => Promise<void> }> = [];

/** Alleen voor tests: reset de module-state. */
export function __resetDeepLinkState(): void {
  inviteToken.value = null;
  setRecovery(false);
}

/**
 * Verwerk een binnengekomen URL.
 *
 * Bij een herstel-link zitten de tokens in de hash. Die halen we zelf op en
 * zetten we er een sessie mee: `setSession` is de enige publieke API hiervoor en
 * vuurt daarna `SIGNED_IN`, niet `PASSWORD_RECOVERY`. Daarom zetten we de
 * herstel-vlag zelf op `true` in plaats van op het event te wachten.
 */
export async function handleIncomingUrl(url: string): Promise<void> {
  if (isRecoveryUrl(url)) {
    // Zelfde parser als voor de uitnodiging: één plek die URLs leest.
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

    setRecovery(true);
    return;
  }

  const token = extractInviteToken(url);
  if (token) inviteToken.value = token;
}

/** Ligt de app binnen Capacitor (dus niet in een gewone browser)? */
function isNativePlatform(): boolean {
  const cap = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return cap?.isNativePlatform?.() === true;
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
  // Webvariant (`?invite=` / `#invite=`): altijd eerst de huidige URL nakijken.
  readCurrentLocation();

  if (!isNativePlatform()) return;
  void onLaunchUrl();
  void registerListener();
}

/**
 * Lees de uitnodiging uit de huidige URL van de WebView en haal die er daarna
 * weer uit. De token mag niet in de URL-balk, de historie of een screenshot
 * achterblijven.
 */
function readCurrentLocation(): void {
  if (typeof window === "undefined") return;
  const current = window.location.href;
  if (current.includes(RECOVERY_PATH)) return; // laat Supabase dit zelf afhandelen

  const token = extractInviteToken(current);
  if (!token) return;

  inviteToken.value = token;

  try {
    window.history.replaceState({}, "", scrubInviteToken(current));
  } catch {
    // Sommige omgevingen blokkeren replaceState; de app blijft werken.
  }
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
    inviteToken,
    /** Handmatig een URL verwerken (webvariant en tests). */
    handleIncomingUrl,
  };
}
