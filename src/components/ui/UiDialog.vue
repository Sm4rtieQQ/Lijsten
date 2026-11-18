<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";

import { registerBackHandler } from "../../composables/useBackNavigation";
import UiEyebrow from "./UiEyebrow.vue";
import UiIconButton from "./UiIconButton.vue";

/**
 * Modale dialoog op de native `<dialog>` met `showModal()` (GitHub-issue #18):
 * de browser vangt de focus, legt de rest van de pagina inert en tekent de
 * `::backdrop`. Het uiterlijk is exact dat van de oude `.new-list-dialog` en
 * `.confirm-dialog`.
 *
 * - `v-model:open` opent en sluit. ESC, de Android-terugknop (§8.13), de
 *   sluitknop (`closable`) en een klik buiten de dialoog zetten `open` op
 *   `false` en emitten `cancel`: sluiten zonder actie.
 * - De inhoud staat in een `<form>`; versturen emit `submit`.
 * - Bij openen krijgt het element met `autofocus` de focus (§8.3).
 * - `size`: `md` is de nieuw-lijstje-dialoog, `sm` de smallere
 *   verwijderbevestiging met een kleinere titel.
 */
type Size = "md" | "sm";

withDefaults(
  defineProps<{
    size?: Size;
    closable?: boolean;
  }>(),
  { size: "md", closable: false },
);
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ cancel: []; submit: [] }>();

const titleId = useId();
const dialogEl = ref<HTMLDialogElement | null>(null);

const sizes: Record<Size, { dialog: string; title: string }> = {
  md: { dialog: "w-[min(calc(100%-36px),440px)]", title: "mb-[22px]" },
  sm: {
    dialog: "w-[min(calc(100%-36px),420px)]",
    title: "mb-5 text-[23px] leading-[1.2] tracking-[-0.02em]",
  },
};

function cancel(): void {
  if (!open.value) return;
  open.value = false;
  emit("cancel");
}

// De terugknop hoort bij de dialoog zolang hij open is. Aanmelden bij het
// openen maakt hem de nieuwste handler, dus hij gaat vóór het scherm eronder.
let offBack: (() => void) | null = null;

function show(): void {
  const el = dialogEl.value;
  // `show` loopt een tick later: is `open` intussen weer dicht, dan niet openen.
  if (!el || el.open || !open.value) return;
  el.showModal();
  // Eenmalige focus op het invoerveld (§5 staat dit toe; §8.3).
  el.querySelector<HTMLElement>("[autofocus]")?.focus();
  offBack ??= registerBackHandler(() => {
    cancel();
    return true;
  });
}

function hide(): void {
  offBack?.();
  offBack = null;
  if (dialogEl.value?.open) dialogEl.value.close();
}

watch(open, (value) => (value ? nextTick(show) : hide()));
onMounted(() => {
  if (open.value) show();
});
onBeforeUnmount(hide);

/** ESC: de browser sluit zelf; wij sluiten via `open` (gecontroleerd). */
function onCancelEvent(event: Event): void {
  event.preventDefault();
  cancel();
}

/** Sloot de browser de dialoog toch zelf (bv. herhaalde ESC), volg dan. */
function onCloseEvent(): void {
  cancel();
}

// Alleen een klik die op de backdrop begint én eindigt telt als "buiten":
// tekst selecteren in het veld en loslaten buiten de dialoog sluit niet.
let pressedOnBackdrop = false;
function onPointerDown(event: PointerEvent): void {
  pressedOnBackdrop = event.target === dialogEl.value;
}
function onClick(event: MouseEvent): void {
  const outside = pressedOnBackdrop && event.target === dialogEl.value;
  pressedOnBackdrop = false;
  if (outside) cancel();
}
</script>

<template>
  <dialog
    ref="dialogEl"
    :class="[
      'rounded-dialog bg-surface text-ink shadow-dialog backdrop:bg-scrim backdrop:backdrop-blur-[2px]',
      sizes[size].dialog,
    ]"
    aria-modal="true"
    :aria-labelledby="titleId"
    :data-size="size"
    @cancel="onCancelEvent"
    @close="onCloseEvent"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <form class="relative p-8" novalidate @submit.prevent="emit('submit')">
      <UiIconButton
        v-if="closable"
        variant="close"
        class="absolute top-[15px] right-[17px]"
        label="Sluiten"
        @click="cancel"
      >
        &times;
      </UiIconButton>
      <UiEyebrow v-if="$slots.eyebrow" class="mb-[7px]">
        <slot name="eyebrow" />
      </UiEyebrow>
      <h2 :id="titleId" :class="sizes[size].title">
        <slot name="title" />
      </h2>
      <slot />
    </form>
  </dialog>
</template>
