<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import HomeView from "./components/HomeView.vue";
import ListDetailView from "./components/ListDetailView.vue";
import LoginView from "./components/LoginView.vue";
import RegisterView from "./components/RegisterView.vue";
import ResetPasswordView from "./components/ResetPasswordView.vue";
import SplashView from "./components/SplashView.vue";
import { useAuth } from "./composables/useAuth";
import { initDeepLink, useDeepLink } from "./composables/useDeepLink";
import { useLists } from "./composables/useLists";
import { bindSyncUser } from "./composables/useSync";

const { user, initialized, recovery, init } = useAuth();
const { inviteToken } = useDeepLink();
const { activeListId, hydrate, reset, refreshData } = useLists();

const sessionKey = ref(0);

// Laadscherm (§8.7): tonen zolang auth niet geïnitialiseerd is én tijdens de
// eerste hydrate van een ingelogde gebruiker — met 3 s als vangnet, zodat het
// overzicht nooit lang leeg flitst en een trage server de app niet blokkeert.
const hydrating = ref(false);
let hydrateTimer: ReturnType<typeof setTimeout> | null = null;

// Minimumtoonduur van het laadscherm (AGENTS.md §8.7: "altijd eerst het
// laadscherm, ook als de sessie meteen bekend is"). Zonder sessie is
// `getSession()` puur lokaal en resolved binnen een microtask; zonder deze
// vloer zou de splash geen enkele frame zichtbaar zijn.
const MIN_SPLASH_MS = 400;
const minSplashDone = ref(false);
let minSplashTimer: ReturnType<typeof setTimeout> | null = null;

function startMinSplashTimer(): void {
  minSplashTimer = setTimeout(() => {
    minSplashTimer = null;
    minSplashDone.value = true;
  }, MIN_SPLASH_MS);
}

const showSplash = computed(
  () => !initialized.value || hydrating.value || !minSplashDone.value,
);

function beginHydrate(userId: string): void {
  hydrating.value = true;
  if (hydrateTimer) clearTimeout(hydrateTimer);
  hydrateTimer = setTimeout(() => {
    hydrateTimer = null;
    hydrating.value = false;
  }, 3000);
  void hydrate(userId).finally(() => {
    if (hydrateTimer) {
      clearTimeout(hydrateTimer);
      hydrateTimer = null;
    }
    hydrating.value = false;
  });
}

function stopHydrating(): void {
  if (hydrateTimer) {
    clearTimeout(hydrateTimer);
    hydrateTimer = null;
  }
  hydrating.value = false;
}

// Zolang het laadscherm dekt, het body-scrollen uitschakelen (C2): de vaste,
// `overflow: hidden`-splash dekt weliswaar het scherm, maar scroll-input zou
// anders nog bij de onderliggende pagina terechtkomen.
watch(
  showSplash,
  (show) => {
    document.body.classList.toggle("no-scroll", show);
  },
  { immediate: true },
);

// Bij wisselen van gebruiker: volledig opnieuw hydrateren (of legen).
// Ook bij een directe wissel A → B (zonder logout-event) wordt de vorige
// sessie eerst volledig gewist (per-user keys + in-memory state).
watch(
  user,
  (next, prev) => {
    if (!next) {
      stopHydrating();
      reset();
      bindSyncUser(null);
      sessionKey.value += 1;
      return;
    }
    if (prev && prev.id !== next.id) {
      reset();
      bindSyncUser(null);
    }
    beginHydrate(next.id);
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

onMounted(() => {
  // Eén plek die de auth initialiseert (A2.2): de composable blijft testbaar.
  void init();
  // Deep link + webvariant van de uitnodiging (AGENTS.md §8.11). De
  // `appUrlOpen`-listener wordt door `useDeepLink()` zelf in `onBeforeUnmount`
  // opgeruimd.
  initDeepLink();
  document.addEventListener("visibilitychange", onVisibilityChange);
  startMinSplashTimer();
});
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (pullTimer) clearTimeout(pullTimer);
  stopHydrating();
  if (minSplashTimer) {
    clearTimeout(minSplashTimer);
    minSplashTimer = null;
  }
});
</script>

<template>
  <div class="app-shell">
    <!-- View-keuze zonder router (A4.2): de volgorde is Splash → ingelogd →
         registratie → wachtwoord herstellen → inloggen. Het laadscherm dekt
         zowel `!initialized` als de eerste hydrate (C3, max. 3 s), plus een
         minimumtoonduur van 400 ms op elke koude start. -->
    <SplashView v-if="showSplash" />
    <template v-else-if="user">
      <!-- Beide views blijven gemonteerd; de .active-klasse bepaalt welke
           zichtbaar is (idem legacy: .view { display:none } / .view.active). -->
      <HomeView :class="{ active: !activeListId }" />
      <ListDetailView :class="{ active: !!activeListId }" />
    </template>
    <ResetPasswordView v-else-if="recovery" @cancel="recovery = false" />
    <RegisterView v-else-if="inviteToken" @cancel="inviteToken = null" />
    <LoginView v-else :key="sessionKey" />
  </div>
</template>
