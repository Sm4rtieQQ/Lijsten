<script setup lang="ts">
import UiSpinner from "./ui/UiSpinner.vue";

// Statisch laadscherm (AGENTS.md §8.7): geen state, geen events. De titel en
// de oranje streep zijn identiek aan de stijl op het overzicht/de detailpagina.
</script>

<template>
  <section
    class="fixed inset-0 z-30 grid h-dvh place-content-center overflow-hidden bg-paper text-ink"
    role="status"
    aria-busy="true"
    data-testid="splash"
  >
    <div class="flex flex-col items-center gap-3.5" aria-hidden="true">
      <h1 class="text-[42px] leading-[1.1]">Lijstjes</h1>
      <span
        class="h-[3px] w-[46px] self-start rounded-[4px] bg-accent"
        data-testid="splash-rule"
      ></span>
    </div>
    <span class="sr-only">Laden…</span>
    <UiSpinner
      size="lg"
      class="fixed right-6 bottom-6"
      data-testid="splash-spinner"
    />
  </section>
</template>
