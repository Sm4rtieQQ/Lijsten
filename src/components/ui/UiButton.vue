<script setup lang="ts">
import { computed, useSlots } from "vue";

/**
 * Knop met tekst. De varianten zijn exact het huidige uiterlijk (visuele
 * gelijkheid tijdens de Tailwind-migratie, GitHub-issue #15):
 * - `primary`: oranje, de oude `.dialog-submit` (pijl via `#trailing`);
 * - `secondary`: oranje tekst met rand, de oude `.button-secondary`;
 * - `text`: oranje tekst, de oude `.text-button`/`.clear-button`;
 * - `text-muted`: grijze tekst, de oude `.back-button`.
 *
 * `armed` (alleen als de knop een twee-stapsbevestiging is, §8.6) zet
 * `aria-pressed`; de gewapende stijl hangt aan dat attribuut en is dus
 * zonder hover zichtbaar. Zonder `armed` krijgt de knop geen `aria-pressed`.
 * Een gebruiker geeft alleen layoutklassen mee (marge, breedte, uitlijning).
 */
type Variant = "primary" | "secondary" | "text" | "text-muted";
type Size = "md" | "sm";

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: "button" | "submit" | "reset";
    block?: boolean;
    armed?: boolean | undefined;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    block: false,
    // Geen `false`: zonder `armed` hoort er geen `aria-pressed` op de knop.
    armed: undefined,
  },
);

const slots = useSlots();

const variants: Record<Variant, string> = {
  primary:
    "flex justify-center gap-[10px] rounded-button bg-accent p-[14px] font-bold text-white hover:bg-accent-dark",
  secondary:
    "min-h-touch rounded-control border border-line p-[11px] font-bold text-accent enabled:hover:border-accent enabled:hover:bg-accent-soft disabled:cursor-default disabled:opacity-60",
  text: "font-bold text-accent hover:text-accent-dark disabled:cursor-default disabled:text-disabled",
  "text-muted":
    "flex items-center gap-[3px] py-[5px] text-[14px] font-semibold text-muted hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "",
  sm: "text-[13px]",
};

/** Een tekstknop met een icoon ervoor (de oude `.clear-button`). */
const textWithIcon = "inline-flex items-center gap-1.5 py-1";

/** Gewapend (§8.6): oranje met witte tekst, ook bij hover. */
const armedLook =
  "transition-[background-color,color,opacity,padding] duration-180 ease-[ease] aria-pressed:rounded-control aria-pressed:bg-accent aria-pressed:px-2 aria-pressed:text-white aria-pressed:hover:bg-accent-dark aria-pressed:hover:text-white";

const classes = computed(() => [
  "[&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]",
  variants[props.variant],
  sizes[props.size],
  props.block && "w-full",
  props.variant === "text" && slots.icon && textWithIcon,
  props.armed !== undefined && armedLook,
]);
</script>

<template>
  <button :type="type" :class="classes" :aria-pressed="armed">
    <slot name="icon" />
    <slot />
    <span v-if="$slots.trailing" class="text-[19px] leading-4">
      <slot name="trailing" />
    </span>
  </button>
</template>
