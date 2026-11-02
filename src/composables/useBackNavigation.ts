import { isNativePlatform } from "../lib/platform";

/**
 * Android-terugknop (AGENTS.md §8.13).
 *
 * Componenten registreren een handler die `true` teruggeeft als hij de
 * terugknop heeft afgehandeld (dialoog sluiten, menu sluiten, terug naar het
 * overzicht). De laatst geregistreerde handler is als eerste aan de beurt, dus
 * een dialoog die bovenop een scherm opent gaat vóór dat scherm.
 *
 * Handelt niemand het af, dan krijgt de fallback van `App.vue` een kans
 * (auth-schermen → inloggen). Anders gaat de app naar het Android-startscherm
 * (`minimizeApp`): de app wordt nooit afgesloten door de terugknop.
 *
 * Registreren gebeurt in de component (`onMounted`/`onBeforeUnmount`, §5).
 */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];
let listenerHandle: { remove: () => Promise<void> } | null = null;

/** Registreert een handler; geeft een functie terug om hem weer af te melden. */
export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  };
}

/** Geeft de terugknop aan de handlers, nieuwste eerst. `false` = niemand. */
export function handleBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    if (handlers[i]?.()) return true;
  }
  return false;
}

/**
 * Volledige afhandeling van één druk op de terugknop: handlers → fallback →
 * app minimaliseren. Los geëxporteerd zodat het zonder Capacitor testbaar is.
 */
export async function onBackButton(
  fallback: () => boolean,
  minimize: () => Promise<void>,
): Promise<void> {
  if (handleBack() || fallback()) return;
  try {
    await minimize();
  } catch {
    // Geen plugin beschikbaar: dan gebeurt er niets (de app sluit in elk geval niet).
  }
}

/**
 * Koppelt de Android-terugknop. Alleen native; in de browser bestaat hij niet
 * (daar sluit ESC dialogen en het menu). Zodra er een `backButton`-listener is,
 * sluit Capacitor de app niet meer zelf af.
 */
export async function initBackButton(fallback: () => boolean): Promise<void> {
  if (!isNativePlatform() || listenerHandle) return;
  try {
    const { App } = await import("@capacitor/app");
    listenerHandle = await App.addListener("backButton", () => {
      void onBackButton(fallback, () => App.minimizeApp());
    });
  } catch {
    // Plugin niet beschikbaar: de app werkt, alleen zonder eigen terugknop.
  }
}

/** Ontkoppelt de terugknop. Aanroepen vanuit `App.vue` (`onBeforeUnmount`). */
export function disposeBackButton(): void {
  void listenerHandle?.remove();
  listenerHandle = null;
}

/** Alleen voor tests. */
export function __resetBackNavigation(): void {
  handlers.length = 0;
  listenerHandle = null;
}
