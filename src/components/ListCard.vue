<script setup lang="ts">
import { computed, ref } from "vue";

import type { DropSide } from "../composables/useDragReorder";
import { titleSize } from "../lib/titleSize";
import type { List } from "../types/app";
import IconDragHandle from "./icons/IconDragHandle.vue";
import IconTrash from "./icons/IconTrash.vue";
import UiIconButton from "./ui/UiIconButton.vue";

/**
 * Eén lijstkaart in het overzicht. Ook gebruikt als zwevende kopie tijdens
 * het slepen (`ghost`): dan zonder `data-drag-id`, zodat hij nooit als doel
 * telt (AGENTS.md §8.15).
 */
const props = withDefaults(
  defineProps<{
    list: List;
    dragging?: boolean;
    dropSide?: DropSide | null;
    ghost?: boolean;
  }>(),
  { dragging: false, dropSide: null, ghost: false },
);

const emit = defineEmits<{
  open: [];
  delete: [];
  "handle-pointerdown": [event: PointerEvent, card: HTMLElement | null];
}>();

const cardEl = ref<HTMLElement | null>(null);

/** Lange titels krijgen een kleinere letter, op één regel (#47). */
const size = computed(() => titleSize(props.list.title));

const completedText = computed(() => {
  const items = props.list.items;
  if (items.length === 0) return "Nog geen items";
  const done = items.filter((item) => item.done).length;
  return `${done} van ${items.length} afgevinkt`;
});

/**
 * Stijl per toestand komt uit data-attributen (§8.15): `data-dragging` is de
 * doorzichtige placeholder, `data-drop` de oranje lijn waar de kaart landt.
 * De drop-after-rand bovenaan blijft de gewone rand, ook bij hover.
 */
const baseClass =
  "group relative flex min-h-[158px] cursor-default flex-col justify-between rounded-card border p-[21px] text-left max-sm:min-h-[135px]";

/** De kaart in de lijst: doorschijnend, tilt op bij hover. */
const cardClass = [
  "border-line-strong/[74.9%] bg-surface/[54.9%] transition-all duration-180 ease-[ease]",
  "hover:-translate-y-[3px] hover:border-line-hover hover:shadow-card-hover",
  "data-dragging:opacity-35",
  "data-[drop=before]:border-t-2 data-[drop=before]:border-t-accent",
  "data-[drop=after]:border-t-line-strong/[74.9%] data-[drop=after]:border-b-2 data-[drop=after]:border-b-accent",
];

/** De zwevende kopie: dicht, met schaduw, zonder animatie. */
const ghostClass = "border-line bg-surface shadow-ghost";

/**
 * Het handvat: `data-drag-handle` houdt de pull-to-refresh hier weg (§8.14),
 * `touch-none` laat de vinger slepen in plaats van scrollen (§8.15). Het
 * klikvlak is onzichtbaar groter (§9), niet over de titel heen.
 */
const handleClass =
  "relative size-[22px] flex-none cursor-grab touch-none text-subtle group-data-dragging:cursor-grabbing after:absolute after:-inset-y-[11px] after:-right-[9px] after:-left-[11px] after:content-[''] [&_svg]:h-5 [&_svg]:w-4 [&_svg]:fill-current";
</script>

<template>
  <article
    ref="cardEl"
    :class="[baseClass, ghost ? ghostClass : cardClass]"
    :data-drag-id="ghost ? undefined : list.id"
    :data-dragging="dragging || undefined"
    :data-drop="dropSide ?? undefined"
    role="button"
    tabindex="0"
    :aria-label="`Lijst ${list.title} openen`"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="flex min-w-0 items-center gap-[9px] pr-[38px]">
      <button
        :class="[handleClass, ghost && 'cursor-grabbing']"
        type="button"
        data-drag-handle
        aria-label="Sleep lijst om te verplaatsen"
        @click.stop
        @keydown.stop
        @pointerdown="emit('handle-pointerdown', $event, cardEl)"
      >
        <IconDragHandle />
      </button>
      <span
        class="max-w-full truncate font-display text-[23px] font-semibold tracking-[-0.035em] data-[title-size=md]:text-[20px] data-[title-size=sm]:text-[16px]"
        :data-title-size="size"
        data-testid="list-title"
        >{{ list.title }}</span
      >
    </div>
    <span class="flex items-center justify-between text-[13px] text-muted">
      <span>{{ completedText }}</span>
      <span class="text-[21px] text-accent">&#8594;</span>
    </span>
    <UiIconButton
      variant="ghost-round"
      class="absolute top-1.5 right-1.5"
      :label="`Lijst ${list.title} verwijderen`"
      @click.stop="emit('delete')"
      @keydown.stop
    >
      <IconTrash class="stroke-[1.6]" />
    </UiIconButton>
  </article>
</template>
