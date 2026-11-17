<script setup lang="ts">
// Draaiende ring in het oranje palet (AGENTS.md §8.7). Alleen presentatie:
// de omgeving zet `role="status"`/`aria-busy` en de voorleestekst. Plaatsing
// (fixed, marge, self-*) geeft de aanroeper via `class` (alleen layout).
withDefaults(defineProps<{ size?: "sm" | "lg" }>(), { size: "sm" });

const sizes = {
  sm: "size-[11px] border-[1.5px]",
  lg: "size-[26px] border-[3px]",
} as const;
</script>

<template>
  <span
    :class="[
      'inline-block animate-spin-fast rounded-full border-accent/28 border-t-accent motion-reduce:animate-none',
      sizes[size],
    ]"
    :data-size="size"
    aria-hidden="true"
  />
</template>
