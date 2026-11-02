<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useArmedConfirm } from "../composables/useArmedConfirm";
import { registerBackHandler } from "../composables/useBackNavigation";
import { useDragReorder } from "../composables/useDragReorder";
import { useLists } from "../composables/useLists";
import ItemRow from "./ItemRow.vue";
import SyncIndicator from "./SyncIndicator.vue";
import type { ListItem } from "../types/app";

const {
  currentList,
  activeListId,
  setActiveList,
  renameList,
  addItem,
  toggleItem,
  renameItem,
  deleteItem,
  clearCompleted,
  reorderItems,
} = useLists();

const list = computed(() => currentList());
const newItemText = ref("");
const editingItemId = ref<string | null>(null);
const editingText = ref("");

// --- Slepen (items herschikken, §8.15): pointer-events + zwevende kopie ---
const {
  draggingId,
  overId,
  side,
  ghost,
  onHandlePointerDown,
  cancel: cancelDrag,
  dispose: disposeDrag,
} = useDragReorder({
  ids: () => list.value?.items.map((item) => item.id) ?? [],
  onReorder: (ids) => {
    const id = activeListId.value;
    if (id) reorderItems(id, ids);
  },
});

const draggedItem = computed(() =>
  list.value?.items.find((item) => item.id === draggingId.value),
);
const ghostStyle = computed(() =>
  ghost.value
    ? {
        left: `${ghost.value.left}px`,
        top: `${ghost.value.top}px`,
        width: `${ghost.value.width}px`,
      }
    : {},
);

const itemCount = computed(() => list.value?.items.length ?? 0);
const doneCount = computed(
  () => list.value?.items.filter((item) => item.done).length ?? 0,
);
const canClear = computed(() => doneCount.value > 0);

// --- Dubbele bevestiging (§8.6): één armed knop tegelijk, 5s timeout ---
const CLEAR_KEY = "clear";

function itemKey(itemId: string): string {
  return `item:${itemId}`;
}

const { armedId, arm, disarm, isArmed, dispose } = useArmedConfirm(onConfirmed);

function onConfirmed(key: string): void {
  if (key === CLEAR_KEY) {
    clearCompletedItems();
    return;
  }
  if (key.startsWith("item:")) removeItem(key.slice("item:".length));
}

function removeItem(itemId: string): void {
  if (editingItemId.value === itemId) editingItemId.value = null;
  deleteItem(itemId);
}

function clearCompletedItems(): void {
  const id = activeListId.value;
  if (id) clearCompleted(id);
}

/** Android-terugknop (§8.13): eerst bewerken annuleren, dan naar het overzicht. */
function onBack(): boolean {
  if (!activeListId.value) return false;
  if (editingItemId.value) cancelEdit();
  else goBack();
  return true;
}

let offBack: (() => void) | null = null;
onMounted(() => {
  offBack = registerBackHandler(onBack);
});
onBeforeUnmount(() => {
  dispose();
  disposeDrag();
  offBack?.();
});

// Bij schakelen naar een andere lijst alle lokale edit/drag-state resetten.
watch(activeListId, () => {
  newItemText.value = "";
  editingItemId.value = null;
  cancelDrag();
  disarm();
});

// Gewapende knop herstellen als het bijbehorende item verdwijnt, of als er
// niets meer afgevinkt is (de clear-knop is dan sowieso uitgeschakeld).
watch(
  () => list.value?.items.map((item) => item.id) ?? [],
  (ids) => {
    const key = armedId.value;
    if (key?.startsWith("item:") && !ids.includes(key.slice("item:".length))) {
      disarm();
    }
  },
);
watch(canClear, (value) => {
  if (!value) disarm();
});

function goBack(): void {
  setActiveList(null);
}

function onTitleChange(event: Event): void {
  const el = event.target as HTMLInputElement;
  const title = el.value.trim();
  const id = activeListId.value;
  if (!id) return;
  if (title) {
    renameList(id, title);
  } else {
    el.value = list.value?.title ?? "";
  }
}

function onAddItem(): void {
  const id = activeListId.value;
  if (!id || !newItemText.value.trim()) return;
  addItem(id, newItemText.value);
  newItemText.value = "";
}

function onToggle(item: ListItem): void {
  toggleItem(item.id);
}

function onDeleteItem(item: ListItem): void {
  // Eerste klik: wapenen. Tweede klik (dezelfde key): verwijderen.
  arm(itemKey(item.id));
}

function startEdit(item: ListItem): void {
  editingItemId.value = item.id;
  editingText.value = item.text;
}

function commitEdit(itemId: string): void {
  if (editingItemId.value !== itemId) return;
  editingItemId.value = null;
  const text = editingText.value.trim();
  if (text) renameItem(itemId, text);
  else deleteItem(itemId);
}

function cancelEdit(): void {
  editingItemId.value = null;
}

function onClearCompleted(): void {
  if (!canClear.value) return;
  // Eerste klik: wapenen. Tweede klik: afgevinkte items verwijderen.
  arm(CLEAR_KEY);
}
</script>

<template>
  <section class="view">
    <template v-if="activeListId && list">
      <header class="detail-topbar">
        <div class="list-title-row">
          <input
            :value="list.title"
            type="text"
            maxlength="60"
            aria-label="Naam van het lijstje"
            @change="onTitleChange"
          />
          <span></span>
        </div>
        <SyncIndicator />
      </header>

      <header class="detail-header">
        <button class="back-button" type="button" @click="goBack">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Alle lijstjes
        </button>
      </header>

      <form class="new-item-form" novalidate @submit.prevent="onAddItem">
        <input
          v-model="newItemText"
          type="text"
          maxlength="160"
          placeholder="Wat wil je onthouden?"
          autocomplete="off"
          aria-label="Nieuw item toevoegen"
        />
        <button class="add-item-button" type="submit" aria-label="Toevoegen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>

      <div class="item-meta">
        <span>{{ itemCount === 1 ? "1 item" : `${itemCount} items` }}</span>
        <button
          class="clear-button"
          :class="{ 'is-armed': isArmed(CLEAR_KEY) }"
          type="button"
          :disabled="!canClear"
          :aria-pressed="isArmed(CLEAR_KEY) ? 'true' : 'false'"
          :aria-label="
            isArmed(CLEAR_KEY)
              ? 'Bevestigen: afgevinkte items verwijderen'
              : 'Verwijder afgevinkte items'
          "
          @click="onClearCompleted"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.5 3.5 11.5 12.5" />
            <path d="M10 11l3 3" />
            <path d="M10 11 3.5 16.5" />
            <path d="M13 14 8.5 21.5" />
            <path d="M3.5 16.5 8.5 21.5" />
          </svg>
          <span>Verwijder afgevinkt</span>
          <span v-if="doneCount > 0">({{ doneCount }})</span>
        </button>
      </div>

      <ul v-if="list.items.length" class="items-list">
        <ItemRow
          v-for="item in list.items"
          :key="item.id"
          v-model:edit-text="editingText"
          :item="item"
          :editing="editingItemId === item.id"
          :armed="isArmed(itemKey(item.id))"
          :dragging="item.id === draggingId"
          :drop-side="item.id === overId ? side : null"
          @toggle="onToggle(item)"
          @start-edit="startEdit(item)"
          @commit-edit="commitEdit(item.id)"
          @cancel-edit="cancelEdit"
          @delete="onDeleteItem(item)"
          @handle-pointerdown="
            (event, row) => onHandlePointerDown(item.id, event, row)
          "
        />
      </ul>

      <div v-else class="list-empty">
        Je lijstje is leeg. Voeg hierboven iets toe.
      </div>
      <!-- Zwevende kopie van het gesleepte item (§8.15); geen klikdoel. -->
      <Teleport to="body">
        <ul
          v-if="ghost && draggedItem"
          class="items-list drag-ghost"
          :style="ghostStyle"
          aria-hidden="true"
          inert
        >
          <ItemRow :item="draggedItem" ghost />
        </ul>
      </Teleport>
    </template>
  </section>
</template>
