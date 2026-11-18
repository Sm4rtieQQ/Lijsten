<script setup lang="ts">
/**
 * Vinkje van een item (§8.5): een vierkant met afgeronde hoeken
 * (`rounded-check`, nooit rond), oranje gevuld met een wit vinkje zodra
 * `checked`. `label` wordt de verplichte `aria-label`. De toestand staat in
 * `data-checked`, zodat de stijl en de specs op het attribuut leunen.
 *
 * Het vakje is 20px; een onzichtbaar klikvlak maakt het 44px (§9).
 */
defineProps<{
  checked: boolean;
  label: string;
}>();
</script>

<template>
  <button
    type="button"
    class="relative grid size-5 flex-none place-items-center rounded-check border-[1.6px] border-check-line p-0 text-white transition-all duration-180 ease-[ease] after:absolute after:-inset-3 after:content-[''] data-checked:border-accent data-checked:bg-accent [&_svg]:w-3 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[2.4] [&_svg]:opacity-0 [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] data-checked:[&_svg]:opacity-100"
    :aria-label="label"
    :data-checked="checked || undefined"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  </button>
</template>
