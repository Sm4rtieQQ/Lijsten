<script setup lang="ts">
/** Gedeelde kaart voor de auth-schermen: eyebrow + `Lijstjes` + vinkje. */
defineProps<{ eyebrow: string }>();
</script>

<template>
  <section class="animate-fade">
    <div
      class="mx-auto mt-[8vh] max-w-[430px] rounded-panel border border-line bg-surface px-[30px] py-[34px] shadow-panel"
    >
      <div class="mb-[18px] flex items-center justify-between">
        <div>
          <!-- `.eyebrow` blijft tot UiEyebrow er is (GitHub-issue #20). -->
          <p class="eyebrow mb-[5px]">{{ eyebrow }}</p>
          <h1 class="mb-[13px]">Lijstjes</h1>
        </div>
        <div
          class="grid size-12 place-items-center rounded-form bg-accent text-[27px] font-bold text-white"
          aria-hidden="true"
        >
          &#10003;
        </div>
      </div>
      <slot />
    </div>
  </section>
</template>
