import { ref, type Ref } from "vue";

/**
 * Twee-staps bevestiging voor gevaarlijke knoppen (AGENTS.md §8.6).
 *
 * Regels:
 * - Eerste `arm(id)` activeert de knop alleen; de tweede keer op dezelfde id
 *   voert `onConfirm(id)` uit en disarmed daarna.
 * - Er is altijd maar één id armed (`armedId`): een ander id arm gaat ten koste
 *   van de vorige.
 * - Na `ARM_TIMEOUT_MS` zonder tweede klik valt de knop automatisch terug.
 * - `disarm()` hoort ook bij: lijstwissel, item verdwijnt, tab naar achteren
 *   en ESC. De eerste drie zijn component-verantwoordelijkheid; ESC en
 *   `visibilitychange` hangen hier aan de composable (één listener per zorg,
 *   opgeruimd via `dispose()`).
 *
 * Bewust géén singleton en géén `onMounted`/`onBeforeUnmount` in de composable:
 * dat houdt hem los van een component-instance en testbaar (fase G).
 */
export const ARM_TIMEOUT_MS = 5000;

export interface ArmedConfirm {
  /** De id die momenteel armed is, of `null`. */
  armedId: Ref<string | null>;
  /** Activeert een id, of voert de bevestiging uit als die al armed is. */
  arm: (id: string) => void;
  /** Herstelt naar de normale staat (zonder actie). */
  disarm: () => void;
  isArmed: (id: string) => boolean;
  /** Verwijdert de globale listeners (ESC, visibilitychange). */
  dispose: () => void;
}

export function useArmedConfirm(onConfirm: (id: string) => void): ArmedConfirm {
  const armedId = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function disarm(): void {
    clearTimer();
    armedId.value = null;
  }

  function arm(id: string): void {
    if (armedId.value === id) {
      // Tweede klik op dezelfde knop: pas nu de actie uitvoeren.
      disarm();
      onConfirm(id);
      return;
    }
    // Een andere knop arm herstelt de vorige automatisch (single armedId).
    armedId.value = id;
    clearTimer();
    timer = setTimeout(disarm, ARM_TIMEOUT_MS);
  }

  function isArmed(id: string): boolean {
    return armedId.value === id;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") disarm();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") disarm();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  function dispose(): void {
    clearTimer();
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }

  return { armedId, arm, disarm, isArmed, dispose };
}
