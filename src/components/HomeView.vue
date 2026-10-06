<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import { useAuth } from "../composables/useAuth";
import { useLists } from "../composables/useLists";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog.vue";
import SyncIndicator from "./SyncIndicator.vue";
import type { List } from "../types/app";

const { user, signOut } = useAuth();
const { lists, setActiveList, createNewList, reorderLists, deleteList } =
  useLists();

const accountOpen = ref(false);
const accountRef = ref<HTMLElement | null>(null);
const accountButtonRef = ref<HTMLButtonElement | null>(null);
const newListTitle = ref("");
const newListDialog = ref<HTMLDialogElement | null>(null);
const newListInput = ref<HTMLInputElement | null>(null);
const deleteTarget = ref<List | null>(null);

// Drag & drop (lijsten herschikken)
const draggingListId = ref<string | null>(null);
const dragOverListId = ref<string | null>(null);

function onDocumentClick(event: MouseEvent): void {
  if (accountRef.value && !accountRef.value.contains(event.target as Node)) {
    accountOpen.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  // ESC sluit het menu en zet de focus terug op de accountknop (E4).
  if (event.key === "Escape" && accountOpen.value) {
    accountOpen.value = false;
    accountButtonRef.value?.focus();
  }
}
onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
});

function toggleAccount(): void {
  accountOpen.value = !accountOpen.value;
}

function openNewListDialog(): void {
  accountOpen.value = false;
  nextTick(() => {
    newListDialog.value?.showModal();
    newListInput.value?.focus();
  });
}

function closeNewListDialog(): void {
  newListDialog.value?.close();
}

function onCreateList(): void {
  const listId = createNewList(newListTitle.value);
  newListTitle.value = "";
  closeNewListDialog();
  if (listId) setActiveList(listId);
}

function openList(list: List): void {
  setActiveList(list.id);
}

function requestDelete(list: List): void {
  deleteTarget.value = list;
}

function onConfirmDelete(): void {
  const target = deleteTarget.value;
  if (target) deleteList(target.id);
  deleteTarget.value = null;
}

async function onLogout(): Promise<void> {
  accountOpen.value = false;
  await signOut();
}

function completedText(list: List): string {
  if (list.items.length === 0) return "Nog geen items";
  const done = list.items.filter((item) => item.done).length;
  return `${done} van ${list.items.length} afgevinkt`;
}

function onListDragStart(list: List, event: DragEvent): void {
  draggingListId.value = list.id;
  event.dataTransfer?.setData("text/plain", list.id);
}

function onListDragEnd(): void {
  draggingListId.value = null;
  dragOverListId.value = null;
}

function onListDragOver(listId: string): void {
  if (draggingListId.value && draggingListId.value !== listId) {
    dragOverListId.value = listId;
  }
}

function onListDrop(targetId: string): void {
  const from = draggingListId.value;
  draggingListId.value = null;
  dragOverListId.value = null;
  if (!from || from === targetId) return;

  const ids = lists.value.map((list) => list.id);
  const fromIndex = ids.indexOf(from);
  const toIndex = ids.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return;
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return;
  next.splice(toIndex, 0, moved);
  reorderLists(next);
}
</script>

<template>
  <section class="view">
    <header class="topbar">
      <div class="topbar-title">
        <h1>Mijn lijstjes</h1>
        <p class="eyebrow below-title">OVERZICHT</p>
      </div>
      <div class="topbar-right">
        <SyncIndicator />
        <div class="home-actions" ref="accountRef">
          <button
            ref="accountButtonRef"
            class="icon-button"
            :class="{ 'is-active': accountOpen }"
            type="button"
            aria-label="Account en acties"
            :aria-expanded="accountOpen"
            aria-controls="account-panel"
            @click="toggleAccount"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div class="account-panel" :hidden="!accountOpen" id="account-panel">
            <button
              class="panel-action panel-add"
              type="button"
              @click="openNewListDialog"
            >
              + Nieuw lijstje
            </button>
            <p class="eyebrow panel-header">Account</p>
            <span class="current-user-email">{{ user?.email }}</span>
            <button
              class="panel-action panel-logout"
              type="button"
              @click="onLogout"
            >
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="list-grid">
      <article
        v-for="list in lists"
        :key="list.id"
        class="list-card"
        :class="{
          dragging: list.id === draggingListId,
          'drag-over': list.id === dragOverListId,
        }"
        role="button"
        tabindex="0"
        :aria-label="`Lijst ${list.title} openen`"
        @click="openList(list)"
        @keydown.enter.prevent="openList(list)"
        @keydown.space.prevent="openList(list)"
        @dragend="onListDragEnd"
        @dragover.prevent="onListDragOver(list.id)"
        @drop.prevent="onListDrop(list.id)"
      >
        <div class="card-title-row">
          <button
            class="list-drag-handle"
            type="button"
            draggable="true"
            aria-label="Sleep lijst om te verplaatsen"
            @click.stop
            @keydown.stop
            @dragstart.stop="onListDragStart(list, $event)"
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
          <span class="card-title">{{ list.title }}</span>
        </div>
        <span class="card-footer">
          <span>{{ completedText(list) }}</span>
          <span class="card-arrow">&#8594;</span>
        </span>
        <button
          class="card-delete"
          type="button"
          :aria-label="`Lijst ${list.title} verwijderen`"
          @click.stop="requestDelete(list)"
          @keydown.stop
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M10 11v6M14 11v6M9 7l1-2h4l1 2M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </article>
    </div>

    <div v-if="lists.length === 0" class="empty-state">
      <div class="empty-icon">+</div>
      <h2>Nog geen lijstjes</h2>
      <p>Maak je eerste lijstje en houd alles heerlijk overzichtelijk.</p>
      <button class="text-button" type="button" @click="openNewListDialog">
        Maak een lijstje
      </button>
    </div>

    <dialog ref="newListDialog" class="new-list-dialog">
      <form class="new-list-form" novalidate @submit.prevent="onCreateList">
        <button
          class="dialog-close"
          type="button"
          aria-label="Sluiten"
          @click="closeNewListDialog"
        >
          &times;
        </button>
        <p class="eyebrow">NIEUW LIJSTJE</p>
        <h2>Hoe heet het lijstje?</h2>
        <input
          ref="newListInput"
          v-model="newListTitle"
          type="text"
          maxlength="60"
          placeholder="Bijvoorbeeld: Boodschappen"
          autocomplete="off"
          aria-label="Naam van het lijstje"
        />
        <button class="dialog-submit" type="submit">
          Maak lijstje <span>&#8594;</span>
        </button>
      </form>
    </dialog>

    <ConfirmDeleteDialog
      v-if="deleteTarget"
      :list="deleteTarget"
      @close="deleteTarget = null"
      @confirm="onConfirmDelete"
    />
  </section>
</template>
