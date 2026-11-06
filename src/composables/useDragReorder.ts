import { ref } from "vue";

import { moveId } from "../lib/utils";

/** Pas slepen na zoveel px beweging (een tik op het handvat is geen sleep). */
export const DRAG_START_DISTANCE = 4;
/** Binnen deze afstand van de schermrand scrolt de pagina mee. */
export const AUTO_SCROLL_EDGE = 56;
/** Px per frame bij automatisch scrollen. */
export const AUTO_SCROLL_SPEED = 12;
/** Zo lang na een sleep wordt de eerstvolgende klik ingeslikt (ms). */
export const SUPPRESS_CLICK_MS = 100;

/** Plek en breedte van de zwevende kopie (`position: fixed`). */
export interface DragGhost {
  left: number;
  top: number;
  width: number;
}

/** Waar de gesleepte rij landt ten opzichte van de rij eronder. */
export type DropSide = "before" | "after";

/**
 * Waar de oranje lijn hoort: `moveId` zet de rij op de plek van het doel, dus
 * naar beneden slepen landt ná het doel en naar boven ervóór.
 */
export function dropSide(
  ids: readonly string[],
  fromId: string,
  overId: string,
): DropSide {
  return ids.indexOf(fromId) < ids.indexOf(overId) ? "after" : "before";
}

/** De rij (`data-drag-id`) onder een schermpunt; de kopie zelf telt niet mee. */
function idAtPointInDocument(x: number, y: number): string | null {
  if (typeof document.elementFromPoint !== "function") return null;
  const row = document.elementFromPoint(x, y)?.closest("[data-drag-id]");
  return row?.getAttribute("data-drag-id") ?? null;
}

interface Pending {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

export interface DragReorderOptions {
  /** De huidige volgorde van de ids. */
  ids: () => string[];
  /** Nieuwe volgorde na een geslaagde drop (één keer per sleep). */
  onReorder: (ids: string[]) => void;
  /** Alleen voor tests: welke rij ligt onder dit punt. */
  idAtPoint?: (x: number, y: number) => string | null;
}

/**
 * Herschikken met pointer-events (muis én touch), met een zwevende kopie van
 * de rij die de vinger/muis volgt (AGENTS.md §8.15).
 *
 * Het handvat roept `onHandlePointerDown` aan; de rest (bewegen, loslaten,
 * ESC, `pointercancel`, automatisch scrollen) luistert tijdelijk op `window`
 * en ruimt zichzelf op. `dispose()` in `onBeforeUnmount` van de component.
 */
export function useDragReorder(options: DragReorderOptions) {
  const idAtPoint = options.idAtPoint ?? idAtPointInDocument;

  /** De rij die gesleept wordt (blijft als placeholder staan). */
  const draggingId = ref<string | null>(null);
  /** De rij waar hij nu boven hangt. */
  const overId = ref<string | null>(null);
  const side = ref<DropSide>("before");
  const ghost = ref<DragGhost | null>(null);

  let pending: Pending | null = null;
  let lastX = 0;
  let lastY = 0;
  let scrollFrame: number | null = null;

  function onHandlePointerDown(
    id: string,
    event: PointerEvent,
    row: HTMLElement | null,
  ): void {
    if (event.button !== 0 || pending || !row) return;
    // Geen tekstselectie, geen native drag, geen compatibele muis-events.
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    pending = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKeydown);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!draggingId.value) {
      const moved = Math.hypot(lastX - pending.startX, lastY - pending.startY);
      if (moved < DRAG_START_DISTANCE) return;
      draggingId.value = pending.id;
      startAutoScroll();
    }
    event.preventDefault();
    updatePosition();
  }

  function updatePosition(): void {
    if (!pending) return;
    ghost.value = {
      left: lastX - pending.offsetX,
      top: lastY - pending.offsetY,
      width: pending.width,
    };
    const target = idAtPoint(lastX, lastY);
    const valid = target && target !== pending.id ? target : null;
    overId.value = valid;
    if (valid) side.value = dropSide(options.ids(), pending.id, valid);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const from = draggingId.value;
    const to = overId.value;
    finish();
    if (!from) return; // alleen getikt, niet gesleept
    suppressNextClick();
    if (!to) return;
    const next = moveId(options.ids(), from, to);
    if (next) options.onReorder(next);
  }

  /**
   * Na een echte sleep vuurt de browser nog een `click` af; losgelaten boven
   * dezelfde kaart zou die de lijst openen. Die ene klik wordt ingeslikt.
   */
  function suppressNextClick(): void {
    const swallow = (event: Event): void => {
      event.stopPropagation();
      event.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(
      () => window.removeEventListener("click", swallow, { capture: true }),
      SUPPRESS_CLICK_MS,
    );
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") cancel();
  }

  /** Afbreken zonder wijziging (ESC, `pointercancel`, unmount). */
  function cancel(): void {
    finish();
  }

  function finish(): void {
    pending = null;
    draggingId.value = null;
    overId.value = null;
    ghost.value = null;
    stopAutoScroll();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", onKeydown);
  }

  // Bij de rand van het scherm meescrollen, ook als de vinger stil staat.
  function startAutoScroll(): void {
    if (typeof requestAnimationFrame !== "function") return;
    const step = (): void => {
      if (!draggingId.value) return;
      const height = window.innerHeight;
      let delta = 0;
      if (lastY < AUTO_SCROLL_EDGE) delta = -AUTO_SCROLL_SPEED;
      else if (lastY > height - AUTO_SCROLL_EDGE) delta = AUTO_SCROLL_SPEED;
      if (delta !== 0) {
        window.scrollBy(0, delta);
        updatePosition();
      }
      scrollFrame = requestAnimationFrame(step);
    };
    scrollFrame = requestAnimationFrame(step);
  }

  function stopAutoScroll(): void {
    if (scrollFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scrollFrame);
    }
    scrollFrame = null;
  }

  return {
    draggingId,
    overId,
    side,
    ghost,
    onHandlePointerDown,
    cancel,
    dispose: cancel,
  };
}
