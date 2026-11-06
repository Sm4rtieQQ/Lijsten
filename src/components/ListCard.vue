<script setup lang="ts">
import { computed, ref } from "vue";

import type { DropSide } from "../composables/useDragReorder";
import type { List } from "../types/app";
import IconDragHandle from "./icons/IconDragHandle.vue";
import IconTrash from "./icons/IconTrash.vue";

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

const completedText = computed(() => {
  const items = props.list.items;
  if (items.length === 0) return "Nog geen items";
  const done = items.filter((item) => item.done).length;
  return `${done} van ${items.length} afgevinkt`;
});
</script>

<template>
  <article
    ref="cardEl"
    class="list-card"
    :class="{
      dragging,
      'drag-over': dropSide !== null,
      'drop-after': dropSide === 'after',
    }"
    :data-drag-id="ghost ? undefined : list.id"
    role="button"
    tabindex="0"
    :aria-label="`Lijst ${list.title} openen`"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="card-title-row">
      <button
        class="list-drag-handle"
        type="button"
        aria-label="Sleep lijst om te verplaatsen"
        @click.stop
        @keydown.stop
        @pointerdown="emit('handle-pointerdown', $event, cardEl)"
      >
        <IconDragHandle />
      </button>
      <span class="card-title">{{ list.title }}</span>
    </div>
    <span class="card-footer">
      <span>{{ completedText }}</span>
      <span class="card-arrow">&#8594;</span>
    </span>
    <button
      class="card-delete"
      type="button"
      :aria-label="`Lijst ${list.title} verwijderen`"
      @click.stop="emit('delete')"
      @keydown.stop
    >
      <IconTrash />
    </button>
  </article>
</template>
