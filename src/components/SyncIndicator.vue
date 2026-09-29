<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useSync, type SyncStatus } from "../composables/useSync";
import type { OutboxEntry } from "../types/sync";

const { status, lastSyncedAt, lastError, queueLength, failedOps, syncNow } =
  useSync();

const isSyncing = computed(() => status.value === "syncing");

/**
 * Na 1,5 seconde stabiel 'Gesynchroniseerd' verdwijnt het tekstlabel en blijft
 * alleen de groene dot over. Elke statuswissel start de timer opnieuw.
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
    if (value === "synced") {
      collapseTimer = setTimeout(() => {
        collapsed.value = true;
      }, COLLAPSE_AFTER_MS);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(collapseTimer));

const labels: Record<SyncStatus, string> = {
  synced: "Gesynchroniseerd",
  pending: "In wachtrijst",
  syncing: "Synchroniseren…",
  error: "Fout",
};

const label = computed(() => labels[status.value]);
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
    `${label.value} · laatste sync: ${fullTimestamp(lastSyncedAt.value)}` +
    (queueLength.value > 0 ? ` · wachtrij: ${queueLength.value}` : ""),
);

const ariaLabel = computed(
  () =>
    `${label.value}. ${actionLabel.value}. Laatste synchronisatie: ` +
    `${fullTimestamp(lastSyncedAt.value)}.`,
);

function opLabel(op: OutboxEntry): string {
  switch (op.type) {
    case "list.create":
      return "Lijst aanmaken";
    case "list.update":
      return "Lijst hernoemen";
    case "list.delete":
      return "Lijst verwijderen";
    case "item.create":
      return "Item toevoegen";
    case "item.update":
      return "Item aanpassen";
    case "item.delete":
      return "Item verwijderen";
    case "list.reorder":
      return "Volgorde lijsten";
    case "item.reorder":
      return "Volgorde items";
  }
}

function truncate(text: string | null, max = 70): string {
  if (!text) return "onbekende fout";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
</script>

<template>
  <div class="sync-indicator" :data-status="status">
    <div class="sync-row" :class="{ 'is-collapsed': collapsed && !isSyncing }">
      <button
        class="sync-pill"
        type="button"
        :disabled="isSyncing"
        :title="tooltip"
        :aria-label="ariaLabel"
        @click="syncNow()"
      >
        <!-- Bezig: alleen een spinner. -->
        <span v-if="isSyncing" class="sync-spinner" aria-hidden="true" />
        <!-- Niet bezig: gekleurde dot + status. -->
        <template v-else>
          <span class="sync-dot" aria-hidden="true" />
          <span class="sync-label">{{ label }}</span>
          <span class="sync-time">{{ shortTime(lastSyncedAt) }}</span>
        </template>
      </button>
    </div>

    <p v-if="status === 'error' && lastError" class="sync-error">
      {{ lastError }}
    </p>
    <ul v-if="status === 'error' && failedOps.length" class="sync-failures">
      <li v-for="op in failedOps" :key="op.opId">
        {{ opLabel(op) }} — {{ truncate(op.lastError) }}
      </li>
    </ul>
  </div>
</template>
