<script setup lang="ts">
/** Gedeelde kaart voor de auth-schermen: eyebrow + `Lijstjes` + vinkje. */
defineProps<{ eyebrow: string }>();
</script>

<template>
  <section class="view active">
    <div class="login-card">
      <div class="login-title">
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h1>Lijstjes</h1>
        </div>
        <div class="app-mark">&#10003;</div>
      </div>
      <slot />
    </div>
  </section>
</template>
