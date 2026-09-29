<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import HomeView from "./components/HomeView.vue";
import ListDetailView from "./components/ListDetailView.vue";
import LoginView from "./components/LoginView.vue";
import { useAuth } from "./composables/useAuth";
import { useLists } from "./composables/useLists";
import { bindSyncUser } from "./composables/useSync";

const { user, initialized } = useAuth();
const { activeListId, hydrate, reset, refreshData } = useLists();

const sessionKey = ref(0);

// Bij wisselen van gebruiker: volledig opnieuw hydrateren (of legen).
// Ook bij een directe wissel A → B (zonder logout-event) wordt de vorige
// sessie eerst volledig gewist (per-user keys + in-memory state).
watch(
  user,
  (next, prev) => {
    if (!next) {
      reset();
      bindSyncUser(null);
      sessionKey.value += 1;
      return;
    }
    if (prev && prev.id !== next.id) {
      reset();
      bindSyncUser(null);
    }
    void hydrate(next.id);
    bindSyncUser(next.id);
    sessionKey.value += 1;
  },
  { immediate: true },
);

// Sinds de "Verversen"-knop is vervangen door de sync-pill: wanneer de gebruiker
// terugkomt op het tabblad wordt de cloud alsnog ingehaald (debounced).
let pullTimer: ReturnType<typeof setTimeout> | null = null;

function onVisibilityChange(): void {
  if (!user.value || document.visibilityState !== "visible") return;
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    pullTimer = null;
    void refreshData();
  }, 800);
}

onMounted(() =>
  document.addEventListener("visibilitychange", onVisibilityChange),
);
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (pullTimer) clearTimeout(pullTimer);
});
</script>

<template>
  <div v-if="!initialized" class="app-shell">
    <p>Bezig met laden…</p>
  </div>
  <div v-else class="app-shell">
    <LoginView v-if="!user" :key="sessionKey" />
    <template v-else>
      <!-- Beide views blijven gemonteerd; de .active-klasse bepaalt welke
           zichtbaar is (idem legacy: .view { display:none } / .view.active). -->
      <HomeView :class="{ active: !activeListId }" />
      <ListDetailView :class="{ active: !!activeListId }" />
    </template>
  </div>
</template>
