<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

import { useArmedConfirm } from "../composables/useArmedConfirm";
import { useAuth } from "../composables/useAuth";
import { flushBeforeSignOut } from "../composables/useSync";
import { registerBackHandler } from "../composables/useBackNavigation";
import { useDragReorder } from "../composables/useDragReorder";
import { useLists } from "../composables/useLists";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog.vue";
import ListCard from "./ListCard.vue";
import SyncIndicator from "./SyncIndicator.vue";
import type { List } from "../types/app";

const { user, signOut } = useAuth();
const {
  lists,
  activeListId,
  setActiveList,
  createNewList,
  reorderLists,
  deleteList,
} = useLists();

const accountOpen = ref(false);
const accountRef = ref<HTMLElement | null>(null);
const accountButtonRef = ref<HTMLButtonElement | null>(null);
const newListTitle = ref("");
const newListDialog = ref<HTMLDialogElement | null>(null);
const newListInput = ref<HTMLInputElement | null>(null);
const deleteTarget = ref<List | null>(null);

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
/** Android-terugknop (§8.13): eerst de dialoog, dan het menu. */
function onBack(): boolean {
  if (activeListId.value) return false; // het overzicht is niet zichtbaar
  if (newListDialog.value?.open) {
    closeNewListDialog();
    return true;
  }
  if (accountOpen.value) {
    accountOpen.value = false;
    return true;
  }
  return false;
}

let offBack: (() => void) | null = null;
onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  offBack = registerBackHandler(onBack);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
  offBack?.();
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

// --- Uitloggen (§7.3): uitloggen wist de outbox, dus eerst alles versturen. ---
// Blijven er wijzigingen achter (offline of fout), dan wordt de knop gewapend
// met de twee-staps bevestiging van §8.6; pas de tweede klik logt uit.
const LOGOUT_KEY = "logout";
const loggingOut = ref(false);
const {
  arm: armLogout,
  disarm: disarmLogout,
  isArmed: isLogoutArmed,
  dispose: disposeLogoutConfirm,
} = useArmedConfirm(() => void doSignOut());
onBeforeUnmount(disposeLogoutConfirm);

// Menu dicht → bevestiging vervalt.
watch(accountOpen, (open) => {
  if (!open) disarmLogout();
});

async function doSignOut(): Promise<void> {
  accountOpen.value = false;
  await signOut();
}

async function onLogout(): Promise<void> {
  if (loggingOut.value) return;
  if (isLogoutArmed(LOGOUT_KEY)) {
    armLogout(LOGOUT_KEY); // tweede klik: toch uitloggen
    return;
  }
  loggingOut.value = true;
  const safe = await flushBeforeSignOut();
  loggingOut.value = false;
  if (safe) await doSignOut();
  else armLogout(LOGOUT_KEY);
}

// --- Slepen (lijsten herschikken, §8.15): pointer-events + zwevende kopie ---
const {
  draggingId,
  overId,
  side,
  ghost,
  onHandlePointerDown,
  dispose: disposeDrag,
} = useDragReorder({
  ids: () => lists.value.map((list) => list.id),
  onReorder: reorderLists,
});
onBeforeUnmount(disposeDrag);

const draggedList = computed(() =>
  lists.value.find((list) => list.id === draggingId.value),
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
            <p
              v-if="isLogoutArmed(LOGOUT_KEY)"
              class="panel-note"
              role="status"
            >
              Niet alle wijzigingen zijn verstuurd. Ze gaan verloren als je nu
              uitlogt.
            </p>
            <button
              class="panel-action panel-logout"
              :class="{ 'is-armed': isLogoutArmed(LOGOUT_KEY) }"
              type="button"
              :disabled="loggingOut"
              :aria-pressed="isLogoutArmed(LOGOUT_KEY) ? 'true' : 'false'"
              :aria-label="
                isLogoutArmed(LOGOUT_KEY)
                  ? 'Bevestigen: toch uitloggen, niet-verstuurde wijzigingen gaan verloren'
                  : undefined
              "
              @click="onLogout"
            >
              {{
                loggingOut
                  ? "Versturen…"
                  : isLogoutArmed(LOGOUT_KEY)
                    ? "Toch uitloggen"
                    : "Uitloggen"
              }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="list-grid">
      <ListCard
        v-for="list in lists"
        :key="list.id"
        :list="list"
        :dragging="list.id === draggingId"
        :drop-side="list.id === overId ? side : null"
        @open="openList(list)"
        @delete="requestDelete(list)"
        @handle-pointerdown="
          (event, card) => onHandlePointerDown(list.id, event, card)
        "
      />
    </div>

    <!-- Zwevende kopie van de gesleepte kaart (§8.15); geen klikdoel. -->
    <Teleport to="body">
      <div
        v-if="ghost && draggedList"
        class="drag-ghost"
        :style="ghostStyle"
        aria-hidden="true"
        inert
      >
        <ListCard :list="draggedList" ghost />
      </div>
    </Teleport>

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
