<script setup lang="ts">
// Klein oranje kopje in hoofdletterafstand (de oude `.eyebrow`). Geen eigen
// marge: de aanroeper geeft die mee (alleen layoutklassen). `sm` is het
// kleinere label in het accountmenu (de oude `.panel-header`).
withDefaults(defineProps<{ size?: "md" | "sm" }>(), { size: "md" });

const sizes = {
  md: "text-[11px]",
  sm: "text-[10px]",
} as const;
</script>

<template>
  <p
    :class="['font-bold tracking-[1.45px] text-accent', sizes[size]]"
    :data-size="size"
  >
    <slot />
  </p>
</template>
