<script setup lang="ts">
import { computed, ref } from "vue";

/**
 * Knop met alleen een icoon; `label` wordt de verplichte `aria-label`.
 * Varianten (GitHub-issue #15):
 * - `outline`: 38px met rand, de accountknop; oranje zolang
 *   `aria-expanded="true"` (menu open, §8.8);
 * - `ghost`: 30px, aanpassen en verwijderen op een item;
 * - `ghost-round`: 44px rond, verwijderen op een lijstkaart;
 * - `close`: 31px rond met een `&times;`, sluiten van een dialoog
 *   (de gebruiker positioneert hem, bv. `absolute`);
 * - `solid`: oranje, item toevoegen (rekt mee in hoogte);
 * - `field`: 31px, in een tekstveld, bv. het oog van een wachtwoordveld
 *   (de gebruiker positioneert hem, bv. `absolute`).
 *
 * Kleiner dan 44px krijgt een onzichtbaar groter klikvlak (§9, touch
 * targets). `armed` werkt als bij `UiButton` (§8.6). `reveal` toont de
 * knop op brede schermen met muis pas bij hover over de `group` eromheen
 * of bij focus; op smalle schermen, op touch en gewapend altijd.
 */
type Variant =
  "outline" | "ghost" | "ghost-round" | "close" | "solid" | "field";

const props = withDefaults(
  defineProps<{
    label: string;
    variant?: Variant;
    type?: "button" | "submit" | "reset";
    armed?: boolean | undefined;
    reveal?: boolean;
  }>(),
  {
    variant: "outline",
    type: "button",
    // Geen `false`: zonder `armed` hoort er geen `aria-pressed` op de knop.
    armed: undefined,
    reveal: false,
  },
);

/**
 * Onzichtbaar klikvlak van 44px rond de knop; de knop zelf moet
 * gepositioneerd zijn. `inset` telt vanaf de binnenkant van de rand.
 */
const hitArea = "after:absolute after:content-['']";

const variants: Record<Variant, string> = {
  outline: `relative grid size-[38px] place-items-center rounded-icon border border-line p-2 text-muted hover:border-accent-line hover:text-accent aria-expanded:border-accent aria-expanded:bg-accent aria-expanded:text-white [&_svg]:block [&_svg]:size-full ${hitArea} after:inset-[-4px]`,
  ghost: `relative size-[30px] flex-none rounded-lg p-[7px] text-icon hover:bg-accent-soft hover:text-accent [&_svg]:size-full ${hitArea} after:inset-[-7px]`,
  "ghost-round":
    "size-11 rounded-full p-3 text-subtle transition-all duration-180 ease-[ease] hover:bg-accent-soft hover:text-accent-dark focus-visible:bg-accent-soft focus-visible:text-accent-dark [&_svg]:size-full",
  close: `size-[31px] rounded-full text-[26px] leading-none text-muted hover:bg-paper hover:text-ink ${hitArea} after:inset-[-6.5px]`,
  solid:
    "grid w-[45px] place-items-center rounded-control bg-accent text-white hover:bg-accent-dark [&_svg]:w-6",
  field: `size-[31px] rounded-[7px] p-[7px] text-muted hover:bg-accent-soft hover:text-accent [&_svg]:size-full ${hitArea} after:inset-[-6.5px]`,
};

/** Gewapend (§8.6): oranje met wit icoon, ook bij hover en zonder hover. */
const armedLook =
  "transition-[background-color,color,opacity,padding] duration-180 ease-[ease] aria-pressed:bg-accent aria-pressed:text-white aria-pressed:hover:bg-accent-dark aria-pressed:hover:text-white";

const revealLook =
  "opacity-0 group-hover:opacity-100 focus:opacity-100 aria-pressed:opacity-100 max-sm:opacity-100 pointer-coarse:opacity-100";

const classes = computed(() => [
  "[&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]",
  variants[props.variant],
  props.armed !== undefined && armedLook,
  props.reveal && revealLook,
]);

const el = ref<HTMLButtonElement | null>(null);

defineExpose({
  /** Zet de focus op de knop (bv. terug na het sluiten van een menu). */
  focus: () => el.value?.focus(),
});
</script>

<template>
  <button
    ref="el"
    :type="type"
    :class="classes"
    :aria-label="label"
    :aria-pressed="armed"
  >
    <slot />
  </button>
</template>
