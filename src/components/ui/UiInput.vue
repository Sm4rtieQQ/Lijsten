<script setup lang="ts">
import { computed, ref } from "vue";

/**
 * Tekstveld. De varianten zijn exact het huidige uiterlijk (visuele
 * gelijkheid tijdens de Tailwind-migratie, GitHub-issue #17):
 * - `boxed`: papierkleurig vlak met rand, de oude `.login-form input`;
 *   bij focus een oranje rand met een zachte ring;
 * - `underline`: alleen een onderlijn, de oude `.new-list-dialog input`
 *   en `.confirm-form input`; bij focus wordt de lijn oranje;
 * - `bare`: geen rand en geen vlak, voor een veld waarvan de omgeving de
 *   focus toont (de lijsttitel, het nieuw-itemformulier).
 *
 * Alle andere attributen (`type`, `placeholder`, `autocomplete`, `aria-*`,
 * …) komen op de `<input>`. Een gebruiker geeft alleen layout- en
 * tekstklassen mee (breedte, lettertype, padding van `bare`).
 */
type Variant = "boxed" | "underline" | "bare";

const props = withDefaults(defineProps<{ variant?: Variant }>(), {
  variant: "boxed",
});

const model = defineModel<string>();

const variants: Record<Variant, string> = {
  boxed:
    "w-full rounded-control border border-line bg-paper p-3 outline-none focus:border-accent focus:shadow-focus",
  underline:
    "w-full border-0 border-b border-line bg-transparent py-[13px] text-[16px] text-ink outline-none focus:border-accent",
  bare: "min-w-0 border-0 bg-transparent text-ink outline-none",
};

const classes = computed(() => variants[props.variant]);

const el = ref<HTMLInputElement | null>(null);

defineExpose({
  /** Zet de focus op het veld (bv. bij het openen van een scherm). */
  focus: () => el.value?.focus(),
  /** Selecteert de tekst in het veld (bv. bij het starten van bewerken). */
  select: () => el.value?.select(),
});
</script>

<template>
  <input ref="el" v-model="model" :class="classes" />
</template>
