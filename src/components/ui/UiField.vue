<script setup lang="ts">
import { computed } from "vue";

/**
 * Label met het veld erin (het `<label>` omsluit het veld, dus er is geen
 * `for`/`id` nodig). De tonen zijn exact het huidige uiterlijk (GitHub-issue
 * #17):
 * - `ink`: vet en donker, de oude `.login-form label`;
 * - `muted`: halfvet en grijs, de oude `.confirm-label`.
 */
type Tone = "ink" | "muted";

const props = withDefaults(defineProps<{ label: string; tone?: Tone }>(), {
  tone: "ink",
});

const tones: Record<Tone, string> = {
  ink: "font-bold text-ink",
  muted: "font-semibold text-muted",
};

const classes = computed(() => [
  "grid gap-[6px] text-[13px]",
  tones[props.tone],
]);
</script>

<template>
  <label :class="classes">
    {{ label }}
    <slot />
  </label>
</template>
