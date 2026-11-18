/**
 * Lengte en lettergrootte van lijsttitels (GitHub-issue #47). Eén bron van
 * waarheid voor de kaart in het overzicht (`ListCard.vue`) en de titel op de
 * detailpagina (`ListDetailView.vue`).
 *
 * Een titel staat altijd op één regel. Hoe langer de titel, hoe kleiner de
 * letter; de drempels zijn op beide pagina's gelijk. Geen DOM-meting
 * (AGENTS.md §5): alleen het aantal tekens telt.
 */

/** Maximale lengte van een nieuwe of hernoemde titel (`maxlength`). */
export const MAX_TITLE_LENGTH = 24;

/** `lg` = normaal, `md` = middel, `sm` = klein. */
export type TitleSize = "lg" | "md" | "sm";

/** Tot en met zoveel tekens blijft de titel op normale grootte. */
const LG_MAX = 16;
/** Tot en met zoveel tekens middel; daarboven klein. */
const MD_MAX = 20;

/**
 * Grootte-stap voor een titel. Telt tekens (code points) na `trim()`, zodat
 * een emoji als één teken telt. Oude titels langer dan `MAX_TITLE_LENGTH`
 * krijgen ook `sm`; de pagina kapt ze af met een ellips.
 */
export function titleSize(title: string): TitleSize {
  const length = Array.from(title.trim()).length;
  if (length <= LG_MAX) return "lg";
  if (length <= MD_MAX) return "md";
  return "sm";
}
