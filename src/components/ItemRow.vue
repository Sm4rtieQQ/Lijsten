<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import type { DropSide } from "../composables/useDragReorder";
import type { ListItem } from "../types/app";
import IconDragHandle from "./icons/IconDragHandle.vue";
import IconTrash from "./icons/IconTrash.vue";
import UiCheck from "./ui/UiCheck.vue";
import UiIconButton from "./ui/UiIconButton.vue";

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

/**
 * De rij; de toestand staat in `data-done`, `data-dragging` en
 * `data-drop="before|after"` (§8.15: de oranje lijn staat waar de rij landt).
 * De zwevende kopie (`ghost`) heeft een eigen rand, achtergrond en schaduw.
 */
const rowBase =
  "group flex min-h-[62px] items-center gap-[11px] rounded-row border py-2 pr-[10px] pl-[5px] max-sm:pl-[7px]";
const rowInList =
  "mb-[10px] border-row-line bg-row transition-all duration-180 ease-[ease] hover:border-row-line-hover hover:bg-row-hover data-dragging:opacity-35 data-[drop=before]:border-t-2 data-[drop=before]:border-t-accent data-[drop=after]:border-t-transparent data-[drop=after]:border-b-2 data-[drop=after]:border-b-accent";
const rowGhost = "m-0 border-line bg-surface shadow-ghost";

/** Sleephandvat; alleen hier neemt een vinger het gebaar over (§8.15). */
const handleClasses =
  "relative block w-[22px] touch-none border-0 bg-transparent p-0 text-subtle after:absolute after:-inset-y-3 after:-left-[5px] after:right-0 after:content-[''] [&_svg]:h-5 [&_svg]:w-4 [&_svg]:fill-current";

/** Tekst en bewerkveld: zelfde maat; afgevinkt grijs en doorgestreept (§8.5). */
const textClasses =
  "min-w-0 flex-1 border-0 bg-transparent px-[2px] py-[7px] text-[16px] leading-[1.35] text-ink outline-none group-data-done:text-done group-data-done:line-through";

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
    :class="[rowBase, ghost ? rowGhost : rowInList]"
    :data-drag-id="ghost ? undefined : item.id"
    :data-done="item.done || undefined"
    :data-dragging="dragging || undefined"
    :data-drop="dropSide ?? undefined"
  >
    <button
      :class="[handleClasses, ghost ? 'cursor-grabbing' : 'cursor-grab']"
      type="button"
      aria-label="Sleep item om te verplaatsen"
      data-drag-handle
      @click.stop
      @pointerdown="emit('handle-pointerdown', $event, rowEl)"
    >
      <IconDragHandle />
    </button>
    <UiCheck
      :checked="item.done"
      :label="item.done ? 'Afvinken ongedaan maken' : 'Item afvinken'"
      @click="emit('toggle')"
    />
    <input
      v-if="editing"
      ref="inputEl"
      v-model="editText"
      :class="[textClasses, 'cursor-text']"
      type="text"
      maxlength="160"
      :aria-label="'Pas item aan: ' + item.text"
      @keydown.enter.prevent="emit('commit-edit')"
      @keydown.esc.prevent="emit('cancel-edit')"
      @blur="emit('commit-edit')"
    />
    <span
      v-else
      :class="[textClasses, 'cursor-pointer']"
      @click="emit('toggle')"
      >{{ item.text }}</span
    >
    <UiIconButton
      variant="ghost"
      reveal
      label="Item aanpassen"
      @click.stop="emit('start-edit')"
    >
      <svg class="stroke-[1.8]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </svg>
    </UiIconButton>
    <UiIconButton
      variant="ghost"
      reveal
      :armed="armed"
      :label="armed ? 'Bevestigen: item verwijderen' : 'Item verwijderen'"
      @click.stop="emit('delete')"
    >
      <IconTrash class="stroke-[1.7]" />
    </UiIconButton>
  </li>
</template>
