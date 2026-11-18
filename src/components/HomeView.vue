<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useArmedConfirm } from "../composables/useArmedConfirm";
import { useAuth } from "../composables/useAuth";
import { flushBeforeSignOut } from "../composables/useSync";
import { registerBackHandler } from "../composables/useBackNavigation";
import { useDragReorder } from "../composables/useDragReorder";
import { useLists } from "../composables/useLists";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog.vue";
import ListCard from "./ListCard.vue";
import SyncIndicator from "./SyncIndicator.vue";
import UiButton from "./ui/UiButton.vue";
import UiDialog from "./ui/UiDialog.vue";
import UiInput from "./ui/UiInput.vue";
import UiEyebrow from "./ui/UiEyebrow.vue";
import UiIconButton from "./ui/UiIconButton.vue";
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
const accountButtonRef = ref<InstanceType<typeof UiIconButton> | null>(null);
const newListTitle = ref("");
const newListOpen = ref(false);
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
/** Android-terugknop (§8.13): het menu. Een open dialoog gaat zelf voor (UiDialog). */
function onBack(): boolean {
  if (activeListId.value) return false; // het overzicht is niet zichtbaar
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
  newListOpen.value = true;
}

function onCreateList(): void {
  const listId = createNewList(newListTitle.value);
  newListTitle.value = "";
  newListOpen.value = false;
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

/** Accountmenu (§8.8): paneel en menu-items. Uitloggen gewapend volgt §8.6. */
const menu = {
  panel:
    "absolute top-12 right-0 z-5 grid w-[210px] gap-1 rounded-popover border border-line bg-surface p-3 shadow-popover",
  action:
    "rounded-lg px-2 py-[10px] text-left hover:bg-accent-soft hover:text-accent-dark",
  add: "text-[14px] font-bold text-accent",
  /* Ruimte en een dunne lijn tussen '+ Nieuw lijstje' en het Account-blok. */
  divider: "mx-2 mt-[10px] border-t border-line pt-[10px]",
  email:
    "overflow-hidden px-2 pt-[2px] pb-1 text-[10px] text-ellipsis text-muted",
  note: "mx-2 mt-1 text-[10px] leading-[1.4] text-accent-dark",
  logout:
    "text-[10px] text-muted disabled:cursor-default disabled:opacity-60 aria-pressed:bg-accent aria-pressed:font-bold aria-pressed:text-white aria-pressed:hover:bg-accent-dark aria-pressed:hover:text-white",
} as const;

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
  <section class="animate-fade">
    <header class="mb-9 flex items-start justify-between">
      <div class="min-w-0">
        <!-- Ruimte onder het h1 houdt de descender van de 'j' heel (§8.10). -->
        <h1 class="overflow-hidden pb-[9px] text-ellipsis whitespace-nowrap">
          Mijn lijstjes
        </h1>
        <UiEyebrow>OVERZICHT</UiEyebrow>
      </div>
      <div class="flex items-center gap-1">
        <SyncIndicator />
        <div ref="accountRef" class="relative flex items-center gap-[14px]">
          <UiIconButton
            ref="accountButtonRef"
            label="Account en acties"
            :aria-expanded="accountOpen"
            aria-controls="account-panel"
            @click="toggleAccount"
          >
            <svg class="stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </UiIconButton>
          <div id="account-panel" :class="menu.panel" :hidden="!accountOpen">
            <button
              :class="[menu.action, menu.add]"
              type="button"
              data-testid="new-list"
              @click="openNewListDialog"
            >
              + Nieuw lijstje
            </button>
            <div :class="menu.divider">
              <UiEyebrow size="sm">Account</UiEyebrow>
            </div>
            <span :class="menu.email">{{ user?.email }}</span>
            <p
              v-if="isLogoutArmed(LOGOUT_KEY)"
              :class="menu.note"
              role="status"
            >
              Niet alle wijzigingen zijn verstuurd. Ze gaan verloren als je nu
              uitlogt.
            </p>
            <button
              :class="[menu.action, menu.logout]"
              type="button"
              data-testid="logout"
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

    <div class="grid grid-cols-2 gap-[14px] max-sm:grid-cols-1">
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
        class="pointer-events-none fixed z-60 origin-[24px_50%] scale-[1.03] rotate-[1.5deg] motion-reduce:scale-none motion-reduce:rotate-none"
        :style="ghostStyle"
        data-drag-ghost
        aria-hidden="true"
        inert
      >
        <ListCard :list="draggedList" ghost />
      </div>
    </Teleport>

    <div
      v-if="lists.length === 0"
      class="rounded-dialog border border-dashed border-line-dashed px-[25px] py-[72px] text-center"
    >
      <div
        class="mx-auto mb-[17px] grid size-[46px] place-items-center rounded-full bg-accent-soft text-[29px] text-accent"
      >
        +
      </div>
      <h2 class="text-[26px]">Nog geen lijstjes</h2>
      <p
        class="mx-auto mt-[10px] mb-[18px] max-w-[300px] leading-[1.55] text-muted"
      >
        Maak je eerste lijstje en houd alles heerlijk overzichtelijk.
      </p>
      <UiButton variant="text" @click="openNewListDialog">
        Maak een lijstje
      </UiButton>
    </div>

    <UiDialog v-model:open="newListOpen" closable @submit="onCreateList">
      <template #eyebrow>NIEUW LIJSTJE</template>
      <template #title>Hoe heet het lijstje?</template>
      <UiInput
        v-model="newListTitle"
        variant="underline"
        type="text"
        maxlength="60"
        placeholder="Bijvoorbeeld: Boodschappen"
        autocomplete="off"
        autofocus
        aria-label="Naam van het lijstje"
      />
      <UiButton type="submit" block class="mt-[25px]">
        Maak lijstje
        <template #trailing>&#8594;</template>
      </UiButton>
    </UiDialog>

    <ConfirmDeleteDialog
      v-if="deleteTarget"
      :list="deleteTarget"
      @close="deleteTarget = null"
      @confirm="onConfirmDelete"
    />
  </section>
</template>
