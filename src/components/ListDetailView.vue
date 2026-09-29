<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { useLists } from "../composables/useLists";
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
const editInputEl = ref<HTMLInputElement | null>(null);
const draggingItemId = ref<string | null>(null);
const dragOverItemId = ref<string | null>(null);

const itemCount = computed(() => list.value?.items.length ?? 0);
const doneCount = computed(
  () => list.value?.items.filter((item) => item.done).length ?? 0,
);
const canClear = computed(() => doneCount.value > 0);

// Bij schakelen naar een andere lijst alle lokale edit/drag-state resetten.
watch(activeListId, () => {
  newItemText.value = "";
  editingItemId.value = null;
  draggingItemId.value = null;
  dragOverItemId.value = null;
});

watch(editingItemId, (id) => {
  if (!id) return;
  nextTick(() => {
    editInputEl.value?.focus();
    editInputEl.value?.select();
  });
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
  if (editingItemId.value === item.id) editingItemId.value = null;
  deleteItem(item.id);
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
  const id = activeListId.value;
  if (id) clearCompleted(id);
}

// --- Drag & drop (items herschikken) ---
function onItemDragStart(item: ListItem, event: DragEvent): void {
  draggingItemId.value = item.id;
  event.dataTransfer?.setData("text/plain", item.id);
}

function onItemDragEnd(): void {
  draggingItemId.value = null;
  dragOverItemId.value = null;
}

function onItemDragOver(itemId: string): void {
  if (draggingItemId.value && draggingItemId.value !== itemId) {
    dragOverItemId.value = itemId;
  }
}

function onItemDrop(targetId: string): void {
  const id = activeListId.value;
  const from = draggingItemId.value;
  draggingItemId.value = null;
  dragOverItemId.value = null;
  if (!id || !from || from === targetId) return;

  const current = list.value;
  if (!current) return;
  const ids = current.items.map((item) => item.id);
  const fromIndex = ids.indexOf(from);
  const toIndex = ids.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return;
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return;
  next.splice(toIndex, 0, moved);
  reorderItems(id, next);
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
          type="button"
          :disabled="!canClear"
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

      <!-- Bij `dragleave` alleen de `drag-over`-markering wissen; de sleep zelf
           blijft actief tot `drop` of `dragend` (zelfde gedrag als legacy). -->
      <ul
        v-if="list.items.length"
        class="items-list"
        @dragleave="dragOverItemId = null"
      >
        <li
          v-for="item in list.items"
          :key="item.id"
          class="item"
          :class="{
            completed: item.done,
            dragging: item.id === draggingItemId,
            'drag-over': item.id === dragOverItemId,
          }"
          @dragend="onItemDragEnd"
          @dragover.prevent="onItemDragOver(item.id)"
          @drop.prevent="onItemDrop(item.id)"
        >
          <button
            class="drag-handle"
            type="button"
            draggable="true"
            aria-label="Sleep item om te verplaatsen"
            @click.stop
            @dragstart.stop="onItemDragStart(item, $event)"
          >
            <svg viewBox="0 0 16 20" aria-hidden="true">
              <circle cx="5" cy="4" r="1.4" />
              <circle cx="11" cy="4" r="1.4" />
              <circle cx="5" cy="10" r="1.4" />
              <circle cx="11" cy="10" r="1.4" />
              <circle cx="5" cy="16" r="1.4" />
              <circle cx="11" cy="16" r="1.4" />
            </svg>
          </button>
          <button
            class="check-button"
            type="button"
            :aria-label="
              item.done ? 'Afvinken ongedaan maken' : 'Item afvinken'
            "
            @click="onToggle(item)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
          </button>
          <input
            v-if="editingItemId === item.id"
            ref="editInputEl"
            v-model="editingText"
            class="item-text"
            type="text"
            maxlength="160"
            :aria-label="'Pas item aan: ' + item.text"
            @keydown.enter.prevent="commitEdit(item.id)"
            @keydown.esc.prevent="cancelEdit"
            @blur="commitEdit(item.id)"
          />
          <span v-else class="item-text" @click="onToggle(item)">{{
            item.text
          }}</span>
          <button
            class="edit-button"
            type="button"
            aria-label="Item aanpassen"
            @click.stop="startEdit(item)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            class="item-delete-button"
            type="button"
            aria-label="Item verwijderen"
            @click.stop="onDeleteItem(item)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7h16M10 11v6M14 11v6M9 7l1-2h4l1 2M6 7l1 13h10l1-13"
              />
            </svg>
          </button>
        </li>
      </ul>

      <div v-else class="list-empty">
        Je lijstje is leeg. Voeg hierboven iets toe.
      </div>
    </template>
  </section>
</template>
