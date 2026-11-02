import { computed, ref } from "vue";

/** Afstand (px, na weerstand) waarboven loslaten een sync start. */
export const PULL_THRESHOLD = 64;
/** Verder dan dit schuift de indicator niet mee. */
export const PULL_MAX = 96;
/** De indicator beweegt half zo snel als de vinger (voelt als weerstand). */
export const PULL_RESISTANCE = 0.5;

/**
 * Pull-to-refresh: swipe omlaag bovenaan de pagina → synchroniseren
 * (AGENTS.md §8.14).
 *
 * Pure toestandsmachine zonder DOM-listeners: de component (`PullToRefresh.vue`)
 * vertaalt touch-events naar `start`/`move`/`end`/`cancel`. Zo blijft de logica
 * testbaar (§5).
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  /** Hoe ver de indicator nu naar beneden staat (px). */
  const distance = ref(0);
  /** Vinger staat op het scherm en de pull loopt. */
  const pulling = ref(false);
  /** De sync loopt (na loslaten voorbij de drempel). */
  const refreshing = ref(false);
  let startY: number | null = null;

  /** 0..1: hoe ver tot de drempel; bij 1 start loslaten een sync. */
  const progress = computed(() => Math.min(1, distance.value / PULL_THRESHOLD));

  /**
   * Vinger neer. Alleen als de pagina helemaal bovenaan staat, er geen sync
   * loopt en het doel niet geblokkeerd is (invoerveld, sleephandvat, dialoog).
   */
  function start(y: number, atTop: boolean, blocked: boolean): void {
    startY = !refreshing.value && atTop && !blocked ? y : null;
  }

  /**
   * Vinger beweegt. `true` = de pull neemt deze beweging over (de component
   * roept dan `preventDefault` aan, zodat de browser niet zelf scrollt).
   */
  function move(y: number, atTop: boolean): boolean {
    if (startY === null) return false;
    if (!atTop) {
      cancel();
      return false;
    }
    const dy = y - startY;
    if (dy <= 0) {
      // Omhoog bewegen = gewoon scrollen; de pull doet niet (meer) mee.
      distance.value = 0;
      pulling.value = false;
      return false;
    }
    pulling.value = true;
    distance.value = Math.min(PULL_MAX, dy * PULL_RESISTANCE);
    return true;
  }

  /** Vinger los: voorbij de drempel → synchroniseren, anders terugveren. */
  async function end(): Promise<void> {
    if (startY === null) return;
    startY = null;
    pulling.value = false;
    if (distance.value < PULL_THRESHOLD) {
      distance.value = 0;
      return;
    }
    refreshing.value = true;
    distance.value = PULL_THRESHOLD;
    try {
      await onRefresh();
    } finally {
      refreshing.value = false;
      distance.value = 0;
    }
  }

  /** Gebaar afgebroken (bv. `touchcancel` of er werd gescrold). */
  function cancel(): void {
    startY = null;
    pulling.value = false;
    if (!refreshing.value) distance.value = 0;
  }

  return { distance, pulling, refreshing, progress, start, move, end, cancel };
}
