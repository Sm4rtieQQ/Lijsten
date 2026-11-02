<script setup lang="ts">
import { computed, ref } from "vue";

/**
 * Wachtwoordveld met oog-knop om het wachtwoord te tonen/verbergen.
 * Overige attributen (`autocomplete`, `placeholder`, `aria-*`, …) gaan naar
 * de `<input>`, niet naar de wrapper.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Naam in de knop-labels, bv. "wachtwoord" → "Toon wachtwoord". */
  toggleName: string;
}>();
const model = defineModel<string>({ required: true });

const visible = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

const toggleLabel = computed(() => {
  const name = props.toggleName;
  return visible.value
    ? `${name.charAt(0).toUpperCase()}${name.slice(1)} verbergen`
    : `Toon ${name}`;
});

defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<template>
  <span class="password-field">
    <input
      ref="inputEl"
      v-model="model"
      v-bind="$attrs"
      :type="visible ? 'text' : 'password'"
      minlength="6"
    />
    <button
      class="toggle-password-button"
      type="button"
      :aria-label="toggleLabel"
      @click="visible = !visible"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </span>
</template>
