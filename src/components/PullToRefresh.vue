<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";

import { usePullToRefresh } from "../composables/usePullToRefresh";
import { useSync } from "../composables/useSync";

/**
 * Swipe omlaag bovenaan de pagina → volledige sync (AGENTS.md §8.14).
 *
 * Touch-events in plaats van pointer-events: bij pointer-events neemt de
 * browser het gebaar over om te scrollen en vuurt hij `pointercancel`.
 * `touchmove` is niet-passief, zodat de pull de native overscroll kan
 * tegenhouden (`preventDefault`).
 */
const { syncNow } = useSync();
const { distance, pulling, refreshing, progress, start, move, end, cancel } =
  usePullToRefresh(() => syncNow());

/** Hier begint nooit een pull: velden, sleephandvatten en dialogen. */
const BLOCKED = "input, textarea, select, dialog, [data-drag-handle]";

function atTop(): boolean {
  return window.scrollY <= 0;
}

function onTouchStart(event: TouchEvent): void {
  const touch = event.touches[0];
  if (event.touches.length !== 1 || !touch) {
    cancel();
    return;
  }
  const target = event.target;
  const blocked = target instanceof Element && !!target.closest(BLOCKED);
  start(touch.clientY, atTop(), blocked);
}

function onTouchMove(event: TouchEvent): void {
  const touch = event.touches[0];
  if (!touch) return;
  if (move(touch.clientY, atTop()) && event.cancelable) event.preventDefault();
}

function onTouchEnd(): void {
  void end();
}

onMounted(() => {
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchcancel", cancel);
});
onBeforeUnmount(() => {
  window.removeEventListener("touchstart", onTouchStart);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("touchend", onTouchEnd);
  window.removeEventListener("touchcancel", cancel);
});

/** Indicator start net boven het scherm en schuift mee met de vinger. */
const INDICATOR_SIZE = 36;
const indicatorStyle = computed(() => ({
  transform: `translate(-50%, ${distance.value - INDICATOR_SIZE}px)`,
  opacity: refreshing.value ? 1 : Math.min(1, progress.value * 1.4),
}));
const spinnerStyle = computed(() =>
  refreshing.value ? {} : { transform: `rotate(${progress.value * 270}deg)` },
);

/**
 * Eén toestand voor de stijl: `pulling` (vinger volgt direct), `ready`
 * (voorbij de drempel: loslaten synchroniseert), `refreshing` (sync loopt).
 */
const state = computed(() => {
  if (refreshing.value) return "refreshing";
  if (!pulling.value) return "idle";
  return progress.value >= 1 ? "ready" : "pulling";
});
</script>

<template>
  <!-- Altijd aanwezig (onzichtbaar boven het scherm bij afstand 0), zodat hij
       na loslaten vloeiend terugveert. Geen klikdoel: pointer-events none.
       Transform en opacity staan inline: ze volgen de vinger per frame. -->
  <div
    data-testid="pull-indicator"
    :data-state="state"
    class="group pointer-events-none fixed top-safe-top left-1/2 z-40 grid size-9 place-items-center rounded-full bg-surface shadow-indicator transition-[transform,opacity] duration-200 ease-[ease] data-[state=pulling]:transition-none data-[state=ready]:transition-none motion-reduce:transition-none"
    :style="indicatorStyle"
    aria-hidden="true"
  >
    <span
      class="size-[18px] rounded-full border-2 border-accent/28 border-t-accent group-data-[state=ready]:border-r-accent group-data-[state=refreshing]:animate-spin-fast group-data-[state=refreshing]:border-r-accent"
      :style="spinnerStyle"
    />
  </div>
</template>
