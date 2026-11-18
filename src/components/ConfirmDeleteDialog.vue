<script setup lang="ts">
import { ref, watch } from "vue";

import { isExactTitleMatch } from "../lib/utils";
import type { List } from "../types/app";
import UiButton from "./ui/UiButton.vue";
import UiDialog from "./ui/UiDialog.vue";

const props = defineProps<{ list: List }>();
const emit = defineEmits<{ close: []; confirm: [] }>();

// Altijd open zolang de ouder hem toont (`v-if`); sluiten loopt via `close`.
const open = ref(true);
const input = ref("");
const error = ref<string | null>(null);

// Inline foutmelding wissen zodra de gebruiker iets typt.
watch(input, () => {
  if (error.value) error.value = null;
});

function onCancel(): void {
  open.value = false;
  emit("close");
}

function onSubmit(): void {
  // Exacte, hoofdlettergevoelige vergelijking na trim (AGENTS.md §8.3).
  if (isExactTitleMatch(input.value, props.list.title)) {
    emit("confirm");
  } else {
    error.value = "Titel komt niet overeen";
  }
}
</script>

<template>
  <!-- ESC, klik buiten, Annuleren en de Android-terugknop sluiten zonder actie (§8.3, §8.13). -->
  <UiDialog
    v-model:open="open"
    size="sm"
    @cancel="emit('close')"
    @submit="onSubmit"
  >
    <template #eyebrow>LIJST VERWIJDEREN</template>
    <template #title>Voer lijsttitel in om de lijst te verwijderen</template>
    <label
      class="mb-[6px] block text-[13px] font-semibold text-muted"
      for="confirm-list-input"
    >
      Lijsttitel
    </label>
    <input
      id="confirm-list-input"
      v-model="input"
      class="w-full border-0 border-b border-line bg-transparent py-[13px] text-[16px] text-ink outline-0 focus:border-accent"
      type="text"
      :placeholder="list.title"
      maxlength="60"
      autocomplete="off"
      autofocus
      :aria-invalid="error ? 'true' : 'false'"
    />
    <p
      v-if="error"
      class="mt-[10px] text-[14px] font-medium text-negative"
      role="alert"
    >
      {{ error }}
    </p>
    <div class="mt-[26px] flex justify-end gap-[10px]">
      <UiButton variant="outline" @click="onCancel"> Annuleren </UiButton>
      <UiButton variant="danger" type="submit">Verwijderen</UiButton>
    </div>
  </UiDialog>
</template>
