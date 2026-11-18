<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useSync, type SyncStatus } from "../composables/useSync";
import UiSpinner from "./ui/UiSpinner.vue";

const { status, lastSyncedAt, queueLength, syncNow } = useSync();

const isSyncing = computed(() => status.value === "syncing");

/**
 * Na 1,5 seconde stabiele status verdwijnt het tekstlabel en blijft alleen de
 * dot over (AGENTS.md §7.4). Dat geldt zowel voor `synced` als voor `error` —
 * één implementatie, geen tweede timer/logica.
 */
const COLLAPSE_AFTER_MS = 1500;
const collapsed = ref(false);
let collapseTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  status,
  (value) => {
    clearTimeout(collapseTimer);
    collapseTimer = undefined;
    collapsed.value = false;
    if (value === "synced" || value === "error") {
      collapseTimer = setTimeout(() => {
        collapsed.value = true;
      }, COLLAPSE_AFTER_MS);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(collapseTimer));

/** Tijdens het synchroniseren nooit ingeklapt (dan staat er alleen een spinner). */
const isCollapsed = computed(() => collapsed.value && !isSyncing.value);

const labels: Record<SyncStatus, string> = {
  synced: "Gesynchroniseerd",
  pending: "In wachtrij",
  syncing: "Synchroniseren…",
  error: "Fout bij synchroniseren",
};

const statusLabel = computed(() => labels[status.value]);
const actionLabel = computed(() =>
  status.value === "error" ? "Probeer opnieuw" : "Synchroniseer nu",
);

function fullTimestamp(iso: string | null): string {
  if (!iso) return "nog niet gesynchroniseerd";
  return new Date(iso).toLocaleString("nl-NL");
}

/** Korte tijd voor naast de pill (datum staat in de tooltip). */
function shortTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const tooltip = computed(
  () =>
    `${statusLabel.value} · laatste sync: ${fullTimestamp(lastSyncedAt.value)}` +
    (queueLength.value > 0 ? ` · wachtrij: ${queueLength.value}` : ""),
);

/*
 * Klikzone (§7.4/§9): een transparante rand (13px boven/onder, 14px
 * links/rechts) maakt de pill, ook ingeklapt tot alleen de dot (16×18),
 * minstens 44×44 px raakbaar zonder dat hij groter oogt. De negatieve marge
 * houdt de lay-out gelijk en `bg-clip-padding` houdt de achtergrond binnen de
 * rand. Maten = zichtbare maat + 2 × de rand.
 */
const pill = [
  "-mx-[14px] -my-[13px] inline-flex min-h-11 max-w-[328px] min-w-0 items-center overflow-hidden rounded-pill border-x-[14px] border-y-[13px] border-transparent bg-clip-padding px-[7px] py-0 text-[8px] font-semibold text-muted",
  "[transition:min-width_0.3s_ease,min-height_0.3s_ease,max-width_0.3s_ease,padding_0.3s_ease,background-color_0.18s_ease,color_0.18s_ease]",
  "disabled:cursor-default disabled:px-1 focus-visible:outline-offset-[-13px]",
  "group-data-[status=synced]:bg-positive-soft group-data-[status=synced]:text-positive",
  "group-data-[status=pending]:bg-warning-soft group-data-[status=pending]:text-warning",
  "group-data-[status=error]:bg-negative-soft group-data-[status=error]:text-negative",
  // Ingeklapt: alleen de dot, in een pill van 16×18 zichtbaar.
  "group-data-[collapsed=true]:max-w-[46px] group-data-[collapsed=true]:min-w-11 group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:p-0",
];

const dot =
  "size-1 flex-none rounded-full bg-positive group-data-[status=error]:bg-negative group-data-[status=pending]:bg-warning-dot";

const fades =
  "ml-[5px] flex-none whitespace-nowrap transition-[max-width,margin-left,opacity] duration-300 ease-[ease] group-data-[collapsed=true]:ml-0 group-data-[collapsed=true]:max-w-0 group-data-[collapsed=true]:opacity-0";

const label = `${fades} max-w-[260px]`;
const time = `${fades} max-w-[120px] overflow-hidden text-[7px] text-muted tabular-nums`;

const ariaLabel = computed(
  () =>
    `${statusLabel.value}. ${actionLabel.value}. Laatste synchronisatie: ` +
    `${fullTimestamp(lastSyncedAt.value)}.`,
);
</script>

<template>
  <div
    class="group flex flex-col items-end gap-1.5"
    :data-status="status"
    :data-collapsed="isCollapsed ? 'true' : 'false'"
    aria-live="polite"
  >
    <button
      :class="pill"
      type="button"
      :disabled="isSyncing"
      :title="tooltip"
      :aria-label="ariaLabel"
      @click="syncNow()"
    >
      <!-- Bezig: alleen een spinner. -->
      <UiSpinner v-if="isSyncing" />
      <!-- Niet bezig: gekleurde dot + status. -->
      <template v-else>
        <span :class="dot" data-testid="sync-dot" aria-hidden="true" />
        <span :class="label" data-testid="sync-label">{{ statusLabel }}</span>
        <span :class="time">{{ shortTime(lastSyncedAt) }}</span>
      </template>
    </button>
  </div>
</template>
