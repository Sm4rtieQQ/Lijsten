<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import type { DropSide } from "../composables/useDragReorder";
import type { ListItem } from "../types/app";
import IconDragHandle from "./icons/IconDragHandle.vue";
import IconTrash from "./icons/IconTrash.vue";

/**
 * Eén item in de detailweergave. De toestand (bewerken, gewapend, slepen)
 * komt van `ListDetailView`; deze component toont en meldt alleen (§5).
 * Ook gebruikt als zwevende kopie tijdens het slepen (`ghost`, §8.15).
 */
const props = withDefaults(
  defineProps<{
    item: ListItem;
    editing?: boolean;
    armed?: boolean;
    dragging?: boolean;
    dropSide?: DropSide | null;
    ghost?: boolean;
  }>(),
  {
    editing: false,
    armed: false,
    dragging: false,
    dropSide: null,
    ghost: false,
  },
);

/** Tekst in het bewerkveld (gedeeld met de ouder via `v-model:edit-text`). */
const editText = defineModel<string>("editText", { default: "" });

const emit = defineEmits<{
  toggle: [];
  "start-edit": [];
  "commit-edit": [];
  "cancel-edit": [];
  delete: [];
  "handle-pointerdown": [event: PointerEvent, row: HTMLElement | null];
}>();

const rowEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

// Bij bewerken meteen de focus in het veld, met de tekst geselecteerd.
watch(
  () => props.editing,
  (editing) => {
    if (!editing) return;
    nextTick(() => {
      inputEl.value?.focus();
      inputEl.value?.select();
    });
  },
  { immediate: true },
);
</script>

<template>
  <li
    ref="rowEl"
    class="item"
    :class="{
      completed: item.done,
      dragging,
      'drag-over': dropSide !== null,
      'drop-after': dropSide === 'after',
    }"
    :data-drag-id="ghost ? undefined : item.id"
  >
    <button
      class="drag-handle"
      type="button"
      aria-label="Sleep item om te verplaatsen"
      @click.stop
      @pointerdown="emit('handle-pointerdown', $event, rowEl)"
    >
      <IconDragHandle />
    </button>
    <button
      class="check-button"
      type="button"
      :aria-label="item.done ? 'Afvinken ongedaan maken' : 'Item afvinken'"
      @click="emit('toggle')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    </button>
    <input
      v-if="editing"
      ref="inputEl"
      v-model="editText"
      class="item-text"
      type="text"
      maxlength="160"
      :aria-label="'Pas item aan: ' + item.text"
      @keydown.enter.prevent="emit('commit-edit')"
      @keydown.esc.prevent="emit('cancel-edit')"
      @blur="emit('commit-edit')"
    />
    <span v-else class="item-text" @click="emit('toggle')">{{
      item.text
    }}</span>
    <button
      class="edit-button"
      type="button"
      aria-label="Item aanpassen"
      @click.stop="emit('start-edit')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </svg>
    </button>
    <button
      class="item-delete-button"
      :class="{ 'is-armed': armed }"
      type="button"
      :aria-pressed="armed ? 'true' : 'false'"
      :aria-label="armed ? 'Bevestigen: item verwijderen' : 'Item verwijderen'"
      @click.stop="emit('delete')"
    >
      <IconTrash />
    </button>
  </li>
</template>
