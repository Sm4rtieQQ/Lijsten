<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

import { isExactTitleMatch } from "../lib/utils";
import type { List } from "../types/app";

const props = defineProps<{ list: List }>();
const emit = defineEmits<{ close: []; confirm: [] }>();

const input = ref("");
const error = ref<string | null>(null);
const dialogEl = ref<HTMLDialogElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

onMounted(() => {
  nextTick(() => {
    dialogEl.value?.showModal();
    inputEl.value?.focus();
  });
});

// Inline foutmelding wissen zodra de gebruiker iets typt.
watch(input, () => {
  if (error.value) error.value = null;
});

function onCancel(): void {
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

// Klik op de backdrop (buiten de dialog) sluit zonder actie.
function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialogEl.value) onCancel();
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="confirm-dialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    @close="onCancel"
    @click="onBackdropClick"
  >
    <form class="confirm-form" novalidate @submit.prevent="onSubmit">
      <p class="eyebrow">LIJST VERWIJDEREN</p>
      <h2 id="confirm-dialog-title">
        Voer lijsttitel in om de lijst te verwijderen
      </h2>
      <label class="confirm-label" for="confirm-list-input">Lijsttitel</label>
      <input
        id="confirm-list-input"
        ref="inputEl"
        v-model="input"
        type="text"
        :placeholder="list.title"
        maxlength="60"
        autocomplete="off"
        :aria-invalid="error ? 'true' : 'false'"
        @keydown.esc.prevent="onCancel"
      />
      <p v-if="error" class="confirm-error" role="alert">{{ error }}</p>
      <div class="confirm-actions">
        <button class="secondary-button" type="button" @click="onCancel">
          Annuleren
        </button>
        <button class="dialog-submit confirm-delete" type="submit">
          Verwijderen
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(calc(100% - 36px), 420px);
  padding: 0;
  border: 0;
  border-radius: 20px;
  color: var(--ink);
  background: var(--white);
  box-shadow: 0 22px 60px #3322143b;
}
.confirm-dialog::backdrop {
  background: #3c2b1f47;
  backdrop-filter: blur(2px);
}
.confirm-form {
  position: relative;
  padding: 32px;
}
.confirm-form h2 {
  margin: 0 0 20px;
  font-family: "Playfair Display", serif;
  font-size: 23px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.confirm-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.confirm-form input {
  width: 100%;
  padding: 13px 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  outline: 0;
  color: var(--ink);
  background: transparent;
  font-size: 16px;
}
.confirm-form input:focus {
  border-color: var(--orange);
}
.confirm-error {
  margin: 10px 0 0;
  color: #a3382f;
  font-size: 14px;
  font-weight: 500;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 26px;
}
</style>
