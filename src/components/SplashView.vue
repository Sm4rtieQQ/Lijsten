<script setup lang="ts">
// Statisch laadscherm (AGENTS.md §8.7): geen state, geen events. De titel en
// de oranje streep zijn identiek aan de stijl op het overzicht/de detailpagina.
</script>

<template>
  <section class="loading-screen" role="status" aria-busy="true">
    <div class="loading-brand" aria-hidden="true">
      <h1 class="loading-title">Lijstjes</h1>
      <span class="loading-rule"></span>
    </div>
    <span class="visually-hidden">Laden…</span>
    <span class="loading-spinner" aria-hidden="true"></span>
  </section>
</template>
