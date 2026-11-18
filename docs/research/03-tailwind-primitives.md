# 03 — Tailwind CSS and styling primitives for the whole app

Navigator: tailwind-primitives · 2026-11-17 · branch `Development` · read-only research

## 1. Question

The user wants **Tailwind CSS for all styling** in Lijstjes, and wants the hand-written `src/styles.css` (1359 lines) replaced over time by Vue primitive components. This reverses the current rule in AGENTS.md §2 ("Gewone CSS (behoud bestaande `styles.css`-stijl en kleurpalet)").

Scope: an inventory of the current styling, the Tailwind setup for Vue 3 + Vite 8 + Vitest 5 + Capacitor/PWA, the primitive API, a migration strategy, what to reuse from `../uur-wijzer`, a proposed ordered issue set, and the AGENTS.md sections that have to change. Not in scope: a visual redesign. The look stays the same and visual parity is the goal.

## 2. What I found

### 2.1 Where styling lives today

- `src/styles.css` is imported once in `src/main.ts`. It is plain CSS in one global file, with custom properties on `:root` (`src/styles.css:1-10`).
- There is **one** scoped `<style>`, in `src/components/ConfirmDeleteDialog.vue` (lines ~70-181). It defines its own dialog, input and button styles (`.confirm-*`).
- Three components set **runtime inline styles**, which stay as they are: `ghostStyle` (drag position, from `useDragReorder`), and `indicatorStyle`/`spinnerStyle` in `PullToRefresh.vue`.
- No other CSS tooling: no PostCSS config, no Tailwind. Prettier 3.9.9 runs with no plugins (`.prettierrc.json`).
- Fonts are loaded from **Google Fonts** in `index.html` (DM Sans 400/500/600/700, Playfair Display 600/700). `public/sw.js` deliberately sends fonts to the network only ("Alleen eigen origin cachen; Supabase en fonts gaan altijd over het netwerk"), so **offline the app falls back to `sans-serif`/`serif`**. AGENTS.md §9 already lists self-hosting the fonts as an open wish.

### 2.2 Tokens and raw values (inventory)

**Named tokens** (`src/styles.css:1-10`):

| var             | value     | role                                                  |
| --------------- | --------- | ----------------------------------------------------- |
| `--paper`       | `#f7f1e8` | app background (also `theme-color` in `index.html`)   |
| `--ink`         | `#342e2a` | text                                                  |
| `--muted`       | `#938a80` | secondary text                                        |
| `--line`        | `#e4d7c6` | borders and dividers                                  |
| `--orange`      | `#e66d35` | accent: primary buttons, armed state, rules, spinners |
| `--orange-dark` | `#ce5925` | accent hover                                          |
| `--orange-soft` | `#f9dfd0` | soft hover background                                 |
| `--white`       | `#fffdfa` | surface (dialogs, panels, login card, new-item form)  |

**Hard-coded colours outside the tokens** (about 30). They need a name or must fold into an existing token:

- Neutrals and borders: `#ddccbfbf` (card border), `#e2b49c` (card hover border), `#e7b69d` (icon-button hover border), `#dfd0be` (new-item form border), `#e6a681` (form focus border), `#eaded0` / `#e6d9ca` (item border, item hover), `#d7c5b0` (dashed empty state), `#b9aea2` (drag handle, card-delete icon), `#c8b9aa` (check border), `#aa9e91` (edit/delete icon), `#aaa198` / `#aaa095` (done text, empty text), `#b2a79b` (placeholder), `#c6bdb3` (disabled clear button).
- Translucent surfaces: `#fffdfa8c` (card), `#fffdfa75` (item hover), `rgba(255,253,250,.42)` (item).
- Status (sync pill, `src/styles.css:345-363`): synced `#2c6e49` on `#e4efe8`; pending `#8a6d1a` on `#fdf3d8`, dot `#d9a92a`; error `#a3382f` on `#f6dddd`. The error red `#a3382f` is also `.confirm-error`.
- Success banner (§8.9): `#1c6b3a` on `#e4f5ea`, border `#b7e0c4`.
- Card dots `#e9b04e` and `#91a772`: **dead**. `.card-dot` is not rendered anywhere.
- Scrim: `#3c2b1f47` + `backdrop-filter: blur(2px)`.

**Shadows** (8 distinct): round-button `0 8px 17px #d25a3860` (dead); card hover `0 11px 25px #51382312`; new-item form `0 5px 13px #5d412109`; focus ring `0 0 0 3px #e66d351a` and `0 0 0 3px rgba(230,109,53,.12)` (two near-identical focus rings); dialog `0 22px 60px #3322143b`; panel `0 13px 28px rgba(68,45,27,.14)`; login card `0 15px 42px rgba(75,50,29,.08)`; banner `0 10px 26px rgba(46,92,63,.16)`; pull indicator `0 4px 14px rgba(52,46,42,.16)`; drag ghost `0 14px 30px rgba(52,46,42,.18)`.

**Radii:** 4 (title rule), 5 (checkbox, §8.5), 7, 8 (small icon buttons, menu items), 10 (inputs, secondary button, armed clear), 11 (submit, confirm buttons), 12 (icon-button), 13 (item row), 14 (account panel), 15 (new-item form, app-mark), 18 (list card), 20 (dialogs, empty state, refresh toast), 22 (login card), 50% (round buttons, dots, spinners), 999px (pills). That is about 13 distinct values with no scale.

**Type:** body DM Sans; `h1`, `h2`, `.card-title`, the title input and dialog titles use Playfair Display with negative letter-spacing (−0.02 to −0.045em). Sizes in px: 7, 8, 10, 11, 13, 14, 16, 19, 21, 23, 26, 28, 34, 36, 39, 42. Eyebrow: 11px/700/1.45px tracking, orange. `h1` line-height 1.12 plus `padding-bottom: 9px` (the descender of the 'j' in §8.10).

**Spacing / layout:** `.app-shell` is `min(100%, 760px)` with safe-area padding `calc(48px + env(safe-area-inset-top))` and the matching right/bottom/left values (`src/styles.css:31-41`). Under `max-width: 520px` it gets smaller paddings (`:1074-1078`). That is the **only breakpoint**, and it is desktop-first (`max-width`).

**Motion:** `@keyframes fade` (view switch, 0.22s), `@keyframes spin` (0.7s and 0.8s variants), transitions of 0.18s and 0.2s/0.3s (sync pill collapse). There are `prefers-reduced-motion` guards for the splash spinner, the pull indicator and the drag ghost.

### 2.3 Recurring UI patterns

| Pattern                 | Today (selectors)                                                                                                                                                                                                                                                                         | Notes                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Primary button          | `.dialog-submit` (full width, orange, radius 11, arrow span), `.confirm-action.is-danger` (scoped), `.add-item-button` (45px square)                                                                                                                                                      | three spellings of "orange solid"                                                       |
| Secondary / outline     | `.button-secondary` (orange text, line border, radius 10, min-height 44), `.confirm-action` (ink text)                                                                                                                                                                                    | two spellings                                                                           |
| Text button             | `.text-button`, `.clear-button`, `.back-button`, `.forgot-password`                                                                                                                                                                                                                       | `.clear-button` has the armed state                                                     |
| Icon button             | `.icon-button` (38px, border, radius 12, `.is-active` when the account menu is open), `.card-delete` (44 circle), `.edit-button` / `.item-delete-button` (30px, radius 8, revealed on hover, always visible ≤520px), `.dialog-close` (31 circle), `.password-field button` (31, radius 7) | `.edit-button` and `.item-delete-button` are byte-identical apart from the stroke width |
| Armed (§8.6)            | `.item-delete-button.is-armed`, `.clear-button.is-armed`, `.panel-logout.is-armed` (`src/styles.css:1045-1065, 1342-1349`)                                                                                                                                                                | all three already set `aria-pressed="true"`, so styling can key on ARIA instead         |
| Checkbox (§8.5)         | `.check-button` (button, 20px, radius 5, orange fill via `.item.completed`)                                                                                                                                                                                                               | defined **twice** (`:640` 24px, `:997` 20px; the later rule wins)                       |
| Pill                    | `.sync-pill` with `data-status` + `.is-collapsed`; 44px hit area through a transparent 13px border with −13px margin (`:310-385`)                                                                                                                                                         | the most fragile CSS in the app; `background-clip` order matters (`:376-381`)           |
| Cards                   | `.list-card` (translucent, radius 18, hover lift), `.login-card`, `.empty-state` (dashed)                                                                                                                                                                                                 |                                                                                         |
| Item row                | `.item` (+ `.completed`, `.dragging`, `.drag-over`, `.drop-after`)                                                                                                                                                                                                                        | `.item` defined **3×** (`:605, :617, :992`)                                             |
| Dialog                  | `.new-list-dialog` (HomeView) and the scoped `.confirm-dialog` (same look, duplicated)                                                                                                                                                                                                    | both native `<dialog>` + `::backdrop`                                                   |
| Inputs                  | boxed `.login-form input` (paper background, radius 10, focus ring), underline (`.new-list-dialog input`, `.confirm-form input`), bare (`.new-item-form input`, `.item-text`, `.list-title-row input` with an animated orange rule)                                                       |                                                                                         |
| Password                | `PasswordInput.vue` → `.password-field` + `.toggle-password-button`                                                                                                                                                                                                                       |                                                                                         |
| Menu                    | `.account-panel` + `.panel-action`/`.panel-add`/`.panel-logout`/`.panel-header`/`.current-user-email`/`.panel-note`                                                                                                                                                                       |                                                                                         |
| Spinners                | `.sync-spinner` (11px), `.loading-spinner` (26px), `.pull-spinner` (18px, progress-driven), `.refresh-status span` (dead)                                                                                                                                                                 | the same ring drawn 4 times                                                             |
| Splash (§8.7)           | `.loading-screen`, `.loading-title`, `.loading-rule`, `.loading-spinner`, `.visually-hidden`, `body.no-scroll`                                                                                                                                                                            |                                                                                         |
| Pull-to-refresh (§8.14) | `.pull-indicator` + `.is-pulling/.is-ready/.is-refreshing`; `html, body { overscroll-behavior-y: contain }`                                                                                                                                                                               |                                                                                         |
| Drag ghost (§8.15)      | `.drag-ghost`, `.drag-ghost > .list-card/.item` overrides; `touch-action: none` only on handles (`:1294-1298`)                                                                                                                                                                            |                                                                                         |
| Banner                  | `.banner-success` (fixed pill, green)                                                                                                                                                                                                                                                     |                                                                                         |

**Duplicate definitions** (§9 warns about these). Exact duplicate selectors where the later one silently wins: `.check-button` (+`svg`), `.item`, `.item-text`, `.icon-button` (+`svg`), `.home-actions` (`:859` and `:1167`), `.sync-pill` (`:261` and `:310`), `.sync-row.is-collapsed .sync-pill` (`:319`, `:371`), `.drag-handle` (`:627`, `:1067`, plus inside the media query), `.list-drag-handle` (`:170`, `:1294`), `body` (`:14`, `:1250`).

**Dead CSS** (no template uses it): `.round-button`, `.card-dot` (+ the nth-child colour rules), `.detail-actions`, `.logout-button`, `.refresh-status`, `.icon-button.is-refreshing`.

**Cross-cutting rules:**

- Tap highlight: `button { -webkit-tap-highlight-color: transparent; touch-action: manipulation }` (`:25-30`, §8.8).
- Focus: there is **no global `:focus-visible` rule**. The app relies on the browser's default outline, with two exceptions (`.sync-pill:focus-visible { outline-offset: -13px }` and the scoped `.confirm-action:focus-visible`). Several inputs set `outline: 0` and replace it with a border colour, which is weaker than §8.8 asks for.
- Touch targets (§9, 44px): met by `.card-delete`, `.sync-pill` and `.button-secondary`. **Not met** by `.edit-button` / `.item-delete-button` (30px), `.check-button` (20px), `.icon-button` (38px), `.dialog-close` (31px) or the password toggle (31px).
- Safe areas: `.app-shell` (4 insets, two rules) and `.pull-indicator { top: env(safe-area-inset-top, 0px) }`. The banner and the splash spinner ignore safe areas.

### 2.4 Couplings that a class-name migration will break

These hidden dependencies on CSS class names are the main migration hazard:

1. **Specs select by class.** About 70 selectors in `*.spec.ts` use legacy classes: `.sync-row`/`.sync-pill`/`.sync-dot`/`.sync-label`/`.sync-spinner` (SyncIndicator.spec, 20×), `.icon-button`, `.account-panel`, `.panel-logout`, `.panel-note`, `.clear-button`, `.edit-button`, `input.item-text`, `.list-card`, `.list-drag-handle`, `.drag-ghost`, `.login-message`, `button.forgot-password`, `button.button-secondary`, `.toggle-password-button`, `h1.loading-title`, `.loading-rule`, `.loading-spinner`, `.visually-hidden`, `.pull-indicator`. There are also **17 `classes()` assertions** on state classes: `is-collapsed` (7), `is-active` (4), `is-armed` (3), `dragging`, `is-ready`.
2. **Runtime code selects by class.** `PullToRefresh.vue:20-21` blocks the pull gesture on `".drag-handle, .list-drag-handle"`. If the handles lose those classes, the pull would start from a drag handle (§8.14 violation) **with no test failing**.
3. `App.vue:127` toggles `body.no-scroll`. `useDragReorder.ts:39` uses `[data-drag-id]` (safe, it is an attribute).
4. `App.vue` controls view visibility through a `class="active"` that falls through onto `HomeView`/`ListDetailView`, combined with `.view { display: none }` / `.view.active { display: block }` and the `fade` animation.

### 2.5 Tooling facts (checked 2026-11-17)

- Installed: `vite 8.3.1`, `vitest 5.0.3`, `@vitejs/plugin-vue 6.0.9`, `prettier 3.9.9`, `jsdom 30.1.2` (from `node_modules/*/package.json`).
- `npm view`: `tailwindcss@4.3.5` and `@tailwindcss/vite@4.3.5`, with peer `vite: ^5.2.0 || ^6 || ^7 || ^8` (**compatible with Vite 8**). `prettier-plugin-tailwindcss@0.8.1` (peer `prettier ^3.0`). `class-variance-authority@0.7.1`. `tailwind-variants@4.0.2`.
- `../uur-wijzer` already runs the same stack in production use: Vite 8.3.8, Vitest 5.0.4, `@tailwindcss/vite ^4.3.5`, `tailwindcss ^4.3.3`, Capacitor 8 Android. That is direct evidence that v4 + Vite 8 + Capacitor works for this user.
- Tailwind v4 browser baseline (Tailwind docs, from memory, **unverified this session**): Safari 16.4+, Chrome 111+, Firefox 128+. It relies on cascade layers, `@property` and `color-mix()`.
- Lijstjes `minSdkVersion = 24` (`android/variables.gradle:2`). The Android System WebView updates through the Play Store, so any device that keeps its WebView updated is fine.
- Vitest does **not process CSS** by default: CSS imports become empty strings. uur-wijzer's `tokens.spec.ts` documents this and reads the CSS from disk instead. So jsdom tests are unaffected by Tailwind itself. Only class-name selectors and assertions matter (2.4).
- Tailwind v4 scans sources automatically and respects `.gitignore`. `dist/` and `android/app/src/main/assets/public/` are already ignored (`.gitignore`), so the build output is not scanned.

### 2.6 Prior art: `../uur-wijzer` (read-only)

Branches `feat/20…25` have all been merged into `main` (PRs #35, #40, #41, #51, #73, #74). The approach there:

- `src/styles/tokens.css`: the only file with raw values, as `--uw-*` runtime tokens and size tokens (`--control-h`, `--safe-top`, …).
- `src/styles/main.css`: `@import 'tailwindcss'`, `fonts.css` and `tokens.css`. `@theme inline { --color-canvas: var(--uw-canvas); … }` exposes the runtime tokens as utilities. A plain `@theme { --radius-dialog; --text-h1…; }` holds the fixed shape and type scale. An `@layer base` holds html/body/headings and the global `:focus-visible`. It also has shared keyframes.
- `src/components/ui/Ui*.vue`: `UiButton` (variants primary/secondary/ghost/danger/text/text-danger, sizes md/sm, `block`, `#icon` slot), `UiIconButton` (required `label` → `aria-label`, `size-11` = 44px), `UiField`, `UiInput`, `UiSelect`, `UiSwitch`, `UiBadge`, `UiProgress`, `UiSheet`, `UiSection`, `UiList`/`UiListRow`, `UiDialog` (div + scrim, focus return, ESC), `UiDrawer`, `UiAlert`.
- Variants are **plain `Record<Variant, string>` maps** in `<script setup>` with no dependency (`UiButton.vue`).
- Specs assert utility classes (`UiButton.spec.ts`), and `tokens.spec.ts` checks that every `var(--uw-*)` used anywhere is defined.
- AGENTS.md "Vormgeving" rules: "Alleen Tailwind-utilities op tokens", no custom classes, inline `style` only to pass a CSS variable, pages build only from `Ui*` primitives and tokens.
- Self-hosted Nunito woff2 in `public/fonts` + `fonts.css` + OFL licence, with no Google Fonts link.
- Issue style (e.g. #20 "Add design tokens, Tailwind theme, self-hosted Nunito and viewport-fit=cover"): plain descriptive English title; body with **Problem / need**, **Scope**, **Out of scope**, **Done when** (checkboxes, including "checked in the browser at 360px").

## 3. Options

### 3A. Tailwind version

|        | **A1. Tailwind v4 + `@tailwindcss/vite`, CSS-first `@theme`**                                                                                                                                                                                                                                                                                 | A2. Tailwind v3 + PostCSS + `tailwind.config.ts`                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| How    | `vite.config.ts`: `plugins: [vue(), tailwindcss()]`; tokens in CSS `@theme`; no PostCSS or config file                                                                                                                                                                                                                                        | `postcss.config.js` + `tailwind.config.ts` (`content: [...]`, `theme.extend`)                                                                         |
| Pros   | current major version; peer supports Vite 8; the same setup as uur-wijzer (copy the patterns 1:1); native cascade layers make coexistence with the legacy CSS easy (see 3C); `aria-*`, `data-*`, `pointer-coarse`, `nth-*` and `backdrop:` variants built in; tokens are real CSS variables, so the legacy CSS can read them during migration | wider browser support (older WebViews)                                                                                                                |
| Cons   | needs Chrome 111+/Safari 16.4+ (a very old, never-updated WebView would render unstyled)                                                                                                                                                                                                                                                      | v3 is in maintenance; Vite 8 + PostCSS + v3 is unproven in this user's projects; two different Tailwind dialects across their two projects; JS config |
| Effort | S                                                                                                                                                                                                                                                                                                                                             | S–M                                                                                                                                                   |

### 3B. Variant tooling

|        | **B1. Plain class maps (no dependency)**                                                                        | B2. `class-variance-authority`                                 | B3. `tailwind-variants` (+ `tailwind-merge`)                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| How    | `const variantClasses: Record<Variant,string>`, combined in a `computed` array, as in uur-wijzer `UiButton.vue` | `cva(base, { variants, compoundVariants, defaultVariants })`   | `tv({...})` with slots and automatic conflict merging                                                                |
| Pros   | zero bytes and zero dependency; type-safe through `Record`; the user already knows it; easy to test             | compound variants; small (~1 kB)                               | slots, plus merging of a consumer's `class` without conflicts                                                        |
| Cons   | compound variants are hand-written (rare here)                                                                  | extra dependency for about 6 primitives with 2–4 variants each | largest; pulls in `tailwind-merge`; solves a problem (class overrides) that the primitive rules should forbid anyway |
| Effort | S                                                                                                               | S                                                              | M                                                                                                                    |

The app needs about 6 primitives with at most 4–5 variants, and almost no compound cases (armed × variant is the only one, and it is expressed through an `aria-pressed:` variant). B1 is enough.

### 3C. Migration strategy and coexistence

|        | **C1. Incremental, legacy CSS moved into a cascade layer below utilities, preflight on from day one**                                                                                                                                                                                                                                                              | C2. Incremental, preflight **off** until the final cleanup                                                                                                | C3. Big bang (one PR rewrites everything)                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| How    | `main.css`: `@layer theme, base, legacy, components, utilities;` → `@import "tailwindcss";` → `@import "../styles.css" layer(legacy);`. Legacy rules then beat preflight (base) but **lose to utilities** whatever their specificity. One parity patch in `@layer base` fixes the preflight gaps. Each later PR migrates components and deletes their legacy rules | import only `tailwindcss/theme.css` and `tailwindcss/utilities.css`; keep the legacy `*{box-sizing}` reset; add preflight in the last issue               | rewrite all templates and delete `styles.css` in one go                                                                           |
| Pros   | utilities always win, so a half-migrated component cannot be silently overridden by an old rule; the preflight risk is paid **once, early**, with all screens checked; every PR shrinks `styles.css`                                                                                                                                                               | no global visual shift up front                                                                                                                           | no coexistence period                                                                                                             |
| Cons   | the foundation PR needs a full-app visual check                                                                                                                                                                                                                                                                                                                    | primitives built without preflight may rely on browser defaults; the final PR causes a global shift exactly when there is no old CSS left to compare with | huge diff, parity impossible to review, risky for drag/pull/safe-area/splash; conflicts with AGENTS §1 "Houd veranderingen klein" |
| Effort | foundation M, then S per issue                                                                                                                                                                                                                                                                                                                                     | S then M at the end                                                                                                                                       | L, risky                                                                                                                          |

Notes on C1 (must be verified in the foundation issue; this is standard CSS but was **not run** in this session):

- Unlayered CSS beats every layer. The legacy file **must** be imported into a layer, otherwise every old rule beats every utility on the same element.
- The scoped `<style>` in `ConfirmDeleteDialog.vue` is unlayered. Migrate that component as a whole (it is in the Dialog issue).
- Preflight gaps that the legacy CSS does not cover, to patch or accept in the foundation PR:
  - Headings get `font-weight: inherit`, so `h1`/`h2` would render Playfair at 600 instead of the default 700. Patch: `h1, h2 { font-weight: 700 }` in base, or decide on 600.
  - `svg { display: block }` may shift inline icons (back button, clear button).
  - Placeholders become `color-mix(currentColor 50%)` on login inputs (slight change).
  - The default border colour becomes `currentColor` (only matters for new utilities; set `--default-border-color`-style base: `*{border-color: var(--color-line)}` per the v4 upgrade guide).
  - `p` margins are reset to 0. Check `.empty-state p` (has its own), `.login-copy` (has its own) and the dialog `p.eyebrow` (has its own).

## 4. Recommendation

**A1 + B1 + C1:** Tailwind v4.3 with `@tailwindcss/vite`, CSS-first tokens, plain class maps, and an incremental migration with the legacy CSS in a cascade layer and preflight on from day one.

Why: it is the current version, it is compatible with Vite 8, and it is proven by the user in uur-wijzer on the same stack. Plain maps add no dependency for a small primitive set. Layered coexistence means every PR is small, keeps behaviour unchanged, deletes its own legacy rules, and cannot be silently overridden.

### 4.1 Setup details

- **Packages (devDependencies):** `tailwindcss`, `@tailwindcss/vite`, `prettier-plugin-tailwindcss`. Nothing else.
- **`vite.config.ts`:** add `tailwindcss()` to `plugins`. The `test` block stays on jsdom (do **not** copy uur-wijzer's happy-dom). CSS is not processed in tests, so the plugin is inert there.
- **Files:**
  - `src/styles/main.css` (entry, imported in `main.ts` instead of `styles.css`).
  - `src/styles/tokens.css` (raw values only).
  - `src/styles/fonts.css`.
  - The legacy file stays at `src/styles.css`, imported into `layer(legacy)` from `main.css`, until the cleanup.
- **Tokens, single source of truth from day one:** keep the legacy names working by aliasing them in `tokens.css`, e.g. `--paper: var(--color-paper)`, or the other way round, so the old CSS and the utilities can never drift. Proposed names (semantic, not "orange"):
  - colours: `paper`, `surface` (#fffdfa), `ink`, `muted`, `line`, `accent`, `accent-dark`, `accent-soft`, `subtle` (#b9aea2 handles/icons), `positive`/`positive-soft`, `warning`/`warning-soft`/`warning-dot`, `negative`/`negative-soft`, plus a few named borders (`line-strong` #ddccbf, `focus` #e6a681).
  - `@theme { --color-*: initial; … }` removes Tailwind's default palette, so `bg-orange-500` cannot creep in. The rule "no loose colours" is then enforced by the build.
  - `--font-sans: "DM Sans", …; --font-display: "Playfair Display", …`.
  - Radius scale: start with the **exact current values** as named tokens (`rounded-check` 5, `rounded-control` 10/11, `rounded-icon` 12, `rounded-row` 13, `rounded-card` 18, `rounded-dialog` 20, `rounded-panel` 22, `rounded-pill`). Consolidating them is a separate decision (open question 3).
  - `--shadow-card-hover`, `--shadow-dialog`, `--shadow-panel`, `--shadow-ghost`, `--shadow-focus` (merge the two focus rings into one).
  - `--animate-spin-fast: spin .7s linear infinite`, `--animate-fade: fade .22s ease both` (+ `@keyframes` inside `@theme`).
  - Breakpoint: the app is desktop-first at 520px, Tailwind is mobile-first. Write mobile-first and set `--breakpoint-sm: 521px` (replacing the default 640). This keeps the visual switch point identical.
  - Size and safe-area tokens: `--spacing-safe-top: env(safe-area-inset-top, 0px)` etc. in `@theme inline`, plus `--spacing-touch: 44px`.
- **Base layer** (the only hand-written CSS that remains): html/body background, font and colour; `overscroll-behavior-y: contain` (§8.14); `button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; cursor: pointer }` (§8.8); a **global `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`** (new, closes the gap in 2.3); heading font, weight and letter-spacing; `@keyframes`.
- **Fonts:** self-host DM Sans and Playfair Display as woff2 with `@font-face` (OFL), and drop the Google link and preconnects from `index.html`. Put the files in `src/assets/fonts/` and reference them with **relative** `url()` from `fonts.css`, so Vite hashes and rebases them under `base: "./"`. Do **not** copy uur-wijzer's absolute `/fonts/…`: that path breaks under the GitHub Pages subpath `/Lijsten/` (§8.11). Bump `CACHE_VERSION` in `public/sw.js`. Same-origin font requests then fall into its runtime cache.
- **Dark mode:** out of scope. The app has none, and `theme-color` is static. Because the tokens are CSS variables, a later `[data-theme=dark]` block is possible.
- **Prettier:** `"plugins": ["prettier-plugin-tailwindcss"], "tailwindStylesheet": "./src/styles/main.css"` in `.prettierrc.json`. It sorts static `class` attributes and string literals inside `:class`. Class strings in TS maps are only sorted when listed under `tailwindFunctions`/`tailwindAttributes`, which is acceptable to leave unsorted. Adding the plugin reformats nothing until classes exist, so it is safe in the foundation PR.
- **Capacitor / PWA / offline:** everything is build-time CSS inside `dist/`. No CDN (the Play CDN script is forbidden by §13 "NIET CDN scripts"). Nothing changes for `npx cap sync`.

### 4.2 Primitive set (`src/components/ui/`, `Ui` prefix as in uur-wijzer)

Only primitives with at least two real call-sites, or a §-spec behind them. No generic Card, Badge or Menu framework.

| Primitive                              | Replaces                                                                                                                    | Props / API                                                                                                                                                                                                                      | State mapping                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiButton`                             | `.dialog-submit`, `.confirm-action(.is-danger)`, `.button-secondary`, `.text-button`, `.clear-button`, `.back-button`       | `variant: 'primary' \| 'outline' \| 'outline-accent' \| 'text' \| 'text-muted'`, `block?`, `type` (default `button`), `disabled?`, `armed?`; slots `default`, `#icon`, `#trailing` (the → arrow)                                 | `armed` → sets `aria-pressed="true"/"false"`; styles via `aria-pressed:bg-accent aria-pressed:text-white` (§8.6, visible without hover); `disabled:` variant                                                                                                                                                                             |
| `UiIconButton`                         | `.icon-button`, `.card-delete`, `.edit-button`, `.item-delete-button`, `.add-item-button`, `.dialog-close`, password toggle | required `label` (→ `aria-label`), `variant: 'outline' \| 'ghost' \| 'ghost-round' \| 'solid'`, `size: 'sm' \| 'md' \| 'lg'`, `armed?`, `reveal?` (hover-reveal on wide screens)                                                 | `aria-expanded:` (replaces `.is-active` on the account button, §8.8), `aria-pressed:` (armed), `reveal` → `sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100` (mobile always visible, as today ≤520px). Optional: invisible 44px hit area via `after:absolute after:-inset-[7px]` for the 30px buttons (open question 4) |
| `UiCheck`                              | `.check-button`                                                                                                             | `checked: boolean`, `label`                                                                                                                                                                                                      | `data-checked` → `data-checked:bg-accent data-checked:border-accent`; `rounded-check`, never `rounded-full` (§8.5/§13)                                                                                                                                                                                                                   |
| `UiInput`                              | boxed login input, underline dialog input                                                                                   | `variant: 'boxed' \| 'underline'`, `v-model`, attrs fall through                                                                                                                                                                 | `focus:` border + `shadow-focus`; `aria-invalid:`                                                                                                                                                                                                                                                                                        |
| `UiField`                              | `.login-form label`, `.confirm-label`                                                                                       | `label`, `tone?: 'ink' \| 'muted'`, slot                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                        |
| `PasswordInput` (existing, refactored) | `.password-field`                                                                                                           | unchanged API; built on `UiInput` + `UiIconButton`                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                        |
| `UiDialog`                             | `.new-list-dialog`, scoped `.confirm-dialog`                                                                                | wraps **native `<dialog>` + `showModal()`** (keeps the focus trap, ESC, `::backdrop`, the back-button flow in §8.13 and §8.3 behaviour); props `open`, `labelledby`, `closable?`; slots `eyebrow`, `title`, `default`, `actions` | `backdrop:bg-scrim backdrop:backdrop-blur-[2px]`. Do **not** port uur-wijzer's div-based `UiDialog`                                                                                                                                                                                                                                      |
| `UiSpinner`                            | `.sync-spinner`, `.loading-spinner` (and the ring look of `.pull-spinner`)                                                  | `size: 'sm' \| 'lg'`                                                                                                                                                                                                             | `animate-spin-fast motion-reduce:animate-none`                                                                                                                                                                                                                                                                                           |
| `UiEyebrow` (tiny)                     | `.eyebrow` (6+ uses)                                                                                                        | slot                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                        |

These stay as their own components with utilities, with no new primitive: `SyncIndicator` (unique pill with the 44px border trick; keep `data-status` and style through `group-data-[status=error]:`), `PullToRefresh` (dynamic inline style stays), `ListCard`, `ItemRow`, `SplashView`, `AuthCard` (it already is the "card" primitive for the auth screens), the account menu (could be extracted to `AccountMenu.vue`; the `panel-action` buttons become a local class map, or `UiButton variant="menu"` if a second menu ever appears).

**State hooks: attributes, not classes.** Styling and tests key on ARIA and data attributes that already carry the meaning:

- armed → `aria-pressed`; menu open → `aria-expanded`; done → `data-checked` or `data-done`; sync status → `data-status` (exists); collapsed → `data-collapsed`; drag → `data-dragging` + `data-drop="before|after"` (`data-[drop=after]:border-b-2 data-[drop=after]:border-b-accent`); pull → `data-state="pulling|ready|refreshing"`.
- Ghost: `ListCard`/`ItemRow` already receive `ghost`, so the `.drag-ghost > .list-card` overrides become `ghost && '…'` classes inside the component.
- Drag handles get `data-drag-handle`, and `PullToRefresh`'s `BLOCKED` changes to `"input, textarea, select, dialog, [data-drag-handle]"` **in the same PR**, with a spec. `touch-action: none` → `touch-none` on the handle only (§8.15).
- Specs move from `.find('.sync-row').classes()` to `find('[data-…]')`/`attributes()`. The behaviour assertions stay identical. Where a spec needs a stable hook with no semantic attribute, use `data-testid`, not a styling class.

**`@apply` policy:** none in components (in v4 it would need `@reference` in every SFC). It is allowed only in `main.css` for the base layer. There are no `.btn`-style component classes. Pseudo-elements and backdrops use variants (`backdrop:`, `placeholder:`, `after:`, `nth-[3n+2]:`).

**Class merging:** no `tailwind-merge`. Rule: a consumer may only pass layout classes (margin, width, `self-*`, `col-span-*`) to a primitive, never colour, padding or radius. Fallthrough `class` merges onto the root, and with no conflicting properties no merge tool is needed.

### 4.3 Migration order

Every migration issue keeps behaviour identical, deletes the legacy rules it replaced (including the duplicates), updates the specs to attribute selectors, and includes a browser parity check (desktop + 360px, before/after screenshots) per AGENTS §1 web-first.

1. Foundation: Tailwind, tokens, legacy layer, preflight parity, base layer, prettier plugin.
2. Self-hosted fonts (small; can run in parallel with 3).
3. `UiButton` + `UiIconButton` (port the armed buttons: clear, item delete, logout; the account toggle).
4. `UiInput` + `UiField` + `PasswordInput` → auth screens (Login, Register, Verify, Reset, AuthCard).
5. `UiDialog` → new-list dialog + `ConfirmDeleteDialog` (removes the scoped CSS).
6. `UiSpinner` + `SplashView` (§8.7) + success banner + `body.no-scroll` → `overflow-hidden`.
7. HomeView topbar, account menu, `SyncIndicator` (fragile: hit area, collapse transitions).
8. `ListCard` + empty state + list drag ghost (§8.15).
9. `ListDetailView` + `ItemRow` + `UiCheck` + item drag ghost + title rule.
10. `PullToRefresh` + `data-drag-handle` decoupling (§8.14). Can also be folded into 8/9.
11. App shell (safe areas, `.view`/`active` → `v-show` + `animate-fade`), delete `src/styles.css` and the `legacy` layer, AGENTS.md update. Android debug-APK check only after the user approves (§10.2).

Sensitive areas (drag, pull-to-refresh, safe areas, splash) come last, after the primitives exist, and get a touch-emulation and real-device check.

## 5. Risks

- **Silent overrides during coexistence.** Mitigated by the legacy layer (C1). If someone imports a CSS file unlayered, the old rules win again. Add a spec in the foundation issue that reads `main.css` and asserts `layer(legacy)` is present.
- **Hover semantics change.** Tailwind v4 `hover:` only applies under `@media (hover: hover)`. On touch screens the legacy "sticky hover" lift and colours disappear. This is mostly an improvement, but for hover-revealed buttons on touch tablets wider than 520px (`.edit-button`, `.item-delete-button`) they would never appear except on focus. Suggest `pointer-coarse:opacity-100` (open question 5).
- **Preflight shifts** (heading weight, svg display, placeholders): one-time, caught in the foundation parity check.
- **Hidden selector coupling** (2.4 #2): moving the drag-handle classes breaks the pull-to-refresh guard with no failing test. Mitigated by `data-drag-handle` + a spec in the same PR.
- **Spec churn:** about 70 selectors and 17 class assertions change. That is low risk if each PR keeps the same behaviour assertions and only swaps selectors.
- **WebView baseline:** v4 needs Chrome 111+. A device with a never-updated Android 7–9 WebView would render without layout. Low risk for this audience; mention it in the AGENTS lessons.
- **SyncIndicator hit area:** the 13px transparent border + `background-clip` order is order-dependent today (`src/styles.css:376-381`). In utilities it becomes explicit (`border-13 border-transparent -m-[13px] bg-clip-padding`), which is safer, but it must be checked visually in all 3 statuses and the collapsed state.
- **Font change:** self-hosting changes nothing visually online, and fixes offline (today offline falls back to system fonts). Licence file required (OFL).
- **Bundle size:** neutral to smaller. Tailwind emits only used utilities, and 1359 lines of CSS with dead and duplicate rules go away.
- **No data or security impact.** No migrations, no Supabase changes.

## 6. Open questions (with suggested answers)

1. **Tailwind v4 is fine despite the Chrome 111+ / Safari 16.4+ baseline?** → Yes. Same as uur-wijzer; WebViews auto-update.
2. **Keep the exact current look (parity), or allow a light visual tidy-up during migration?** → Parity first. Any tidy-up is a separate, explicit issue after the cleanup.
3. **Consolidate the ~13 radii, ~16 font sizes and ~10 shadows into a smaller scale?** → Not during migration. Tokens map the exact values first, with a follow-up "tidy token scale" issue later.
4. **Give the 30px edit/delete buttons, the 20px checkbox, the 38px icon button and the 31px close/toggle buttons an invisible 44px hit area (§9)?** → Yes, via a pseudo-element in `UiIconButton`/`UiCheck`. It changes no pixels, but check for overlapping hit areas in `ItemRow`. Mark it as a deliberate behaviour improvement in that issue.
5. **On touch tablets ≥521px, show the edit/delete buttons always (`pointer-coarse:opacity-100`)?** → Yes. It matches §8.6 "armed must be visible without hover".
6. **Add a global `:focus-visible` ring (accent outline)?** → Yes, in the foundation base layer. §8.8 already requires a visible focus.
7. **Self-host the fonts as part of this epic?** → Yes, as a separate small issue (needed for true offline; AGENTS §9 already wishes for it).
8. **Primitive naming: `Ui*` in `src/components/ui/` as in uur-wijzer?** → Yes, for consistency across the user's projects.
9. **Switch view visibility from `.view`/`.active` to `v-show` + fade animation?** → Yes, in the final shell issue. The same behaviour with less global CSS.
10. **Replace state classes in specs with ARIA/data attributes (and `data-testid` where needed)?** → Yes. It decouples tests from styling.

## 7. Proposed GitHub issues (ordered)

Title style follows uur-wijzer (plain, descriptive). Body template: **Problem / need · Scope · Out of scope · Done when**. Every "Done when" also includes: `npm run typecheck`, `npm run test`, `npm run build` and `npm run format:check` green; checked in the browser at desktop and 360px against before-screenshots; the replaced legacy rules deleted from `src/styles.css`.

1. **Add Tailwind v4, design tokens and a legacy CSS layer**
   - **Problem / need.** All styling is in one global CSS file with ~30 loose colours and duplicate rules. The user decided on Tailwind for all styling.
   - **Scope.**
     - Install `tailwindcss` + `@tailwindcss/vite` and add the plugin to `vite.config.ts`.
     - `src/styles/main.css` (layer order `theme, base, legacy, components, utilities`; `@import "tailwindcss"`; `@import "../styles.css" layer(legacy)`) and `src/styles/tokens.css` (§4.1 token set; `--color-*: initial`; legacy `--paper`… aliased to the new tokens).
     - Base layer: body, tap highlight, `overscroll-behavior`, global `:focus-visible`, heading weight parity.
     - `main.ts` imports `main.css`.
     - `prettier-plugin-tailwindcss` with `tailwindStylesheet`.
     - `src/styles/tokens.spec.ts`: every `var(--…)` used is defined, and `main.css` imports the legacy file into a layer.
   - **Out of scope.** Changing any component markup.
   - **Done when.** No visible difference on every screen (login, register, verify, reset, splash, overview, detail, both dialogs, account menu, sync states, drag, pull) versus before-screenshots; `bg-paper`, `text-accent`, `rounded-card` etc. work.
   - **Files.** `package.json`, `package-lock.json`, `vite.config.ts`, `.prettierrc.json`, `src/main.ts`, `src/styles/*`, `src/styles.css` (only removing the `:root` vars that moved).

2. **Self-host DM Sans and Playfair Display for offline use**
   - **Scope.** woff2 files (latin + latin-ext, the used weights) in `src/assets/fonts` + OFL; `fonts.css` with relative `url()`; remove the Google link and preconnects from `index.html`; bump `CACHE_VERSION` in `public/sw.js`.
   - **Done when.** Fonts render with the network off (DevTools offline, PWA), and in a production build under the `./` base.
   - **Files.** `index.html`, `src/styles/fonts.css`, `src/assets/fonts/*`, `public/sw.js`.

3. **Add Button and IconButton primitives and port the armed buttons**
   - **Scope.**
     - `UiButton`, `UiIconButton` (§4.2) with `armed` → `aria-pressed` styling and `aria-expanded` styling.
     - Port `.clear-button`, `.item-delete-button`, `.edit-button`, `.card-delete`, the account `.icon-button`, `.add-item-button`, `.dialog-submit`, `.button-secondary`, `.text-button`/`.forgot-password`, `.back-button`, `.dialog-close`.
     - Specs for the variants and the armed/aria state; update the existing specs from `is-armed`/`is-active` to `aria-pressed`/`aria-expanded`.
   - **Done when.** §8.6 armed visuals (orange, white icon, visible without hover, one at a time, 5 s auto-reset) and §8.8 (orange while the menu is open, no tap flash, focus ring visible) unchanged in the browser and with touch emulation.
   - **Files.** `src/components/ui/UiButton.vue`, `UiIconButton.vue` + specs, `ItemRow.vue`, `ListCard.vue`, `HomeView.vue`, `ListDetailView.vue`, `LoginView.vue`, `RegisterView.vue`, `VerifyEmailView.vue`, `ResetPasswordView.vue`, related specs.

4. **Add Field and Input primitives and restyle the auth screens on them**
   - **Scope.** `UiInput` (boxed/underline), `UiField`; refactor `PasswordInput` onto them; move `AuthCard`, `LoginView`, `RegisterView`, `VerifyEmailView` and `ResetPasswordView` to utilities; `.login-message` becomes a `role`/`data-testid` hook in the specs.
   - **Done when.** The auth screens are pixel-equal; the password toggle works; the focus ring is visible.

5. **Add Dialog primitive and port the new-list and delete-confirm dialogs**
   - **Scope.** `UiDialog` on native `<dialog>`/`showModal()`; port the `HomeView` new-list dialog and `ConfirmDeleteDialog` (removes its scoped `<style>`).
   - **Done when.** §8.3 unchanged (exact texts, `aria-modal`, focus in the input, ESC and outside-click cancel, inline error, case-sensitive match); the Android back button closes the dialog (§8.13).

6. **Add Spinner primitive and restyle the splash screen and success banner**
   - **Scope.** `UiSpinner`; `SplashView` on utilities (`fixed inset-0 h-dvh overflow-hidden`, `sr-only` replaces `.visually-hidden`); success banner; `App.vue` toggles `overflow-hidden` instead of `no-scroll`.
   - **Done when.** §8.7 holds (no scroll, spinner bottom-right, reduced motion stops it, `role=status`/`aria-busy`); §8.9 banner unchanged.

7. **Restyle the overview header, account menu and sync indicator with utilities**
   - **Scope.** Topbar, `.eyebrow` → `UiEyebrow`, account panel and menu items (armed logout keeps §8.6), `SyncIndicator` (keep `data-status`; `data-collapsed`; 44px hit area).
   - **Done when.** §7.4 pill: all 3 statuses, collapse animation, 44×44 hit area, tooltip; §8.8 menu order, ESC, outside click; §8.10 'j' descender visible at 360px.

8. **Restyle list cards and the list drag ghost with utilities**
   - **Scope.** `ListCard` (`data-dragging`, `data-drop`, ghost styling via the `ghost` prop), list grid, empty state; `data-drag-handle` on the handle + `PullToRefresh` `BLOCKED` updated + spec.
   - **Done when.** §8.15 unchanged with mouse and touch emulation (4 px threshold, translucent placeholder, orange line before/after, tilt and shadow ghost, auto-scroll, ESC cancel, swallowed click); a pull never starts from a handle.

9. **Restyle the list detail, item rows and checkbox with utilities**
   - **Scope.** Detail topbar, title input + animated orange rule, back button, new-item form, item meta + clear button, `ItemRow` (`UiCheck`, `data-done`, hover reveal + `pointer-coarse`, drag states, ghost).
   - **Done when.** §8.5 (rounded square checkbox, line-through grey), §8.6 and §8.15 unchanged on desktop and at 360px.

10. **Restyle pull-to-refresh with utilities**
    - **Scope.** `PullToRefresh` (`data-state`, the inline transform kept, safe-area top, reduced motion).
    - **Done when.** §8.14 checked with touch emulation: threshold 64 px, release syncs, below threshold springs back, no Chrome reload.
    - Can be merged into 8 if small.

11. **Remove styles.css and document the Tailwind rules in AGENTS.md**
    - **Scope.** App shell with safe areas (`.app-shell` → utilities with the safe-area spacing tokens), `.view`/`active` → `v-show` + `animate-fade`, delete `src/styles.css` and the `legacy` layer, remove the dead CSS, update AGENTS.md (see §8 below) and `docs/tasks.md`.
    - **Done when.** `grep` finds no legacy class names; every screen passes the parity check; the PWA on iOS/Android respects the notch and home indicator. A debug APK is checked on a device only after the user approves (§10.2).

Optional follow-ups (not part of the epic): "Tidy the radius, type and shadow scale" (open question 3).

## 8. AGENTS.md sections that must change

| Section                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 Techstack, row "Stijl"  | "Tailwind CSS v4 (`@tailwindcss/vite`), tokens in `src/styles/tokens.css` + `@theme` in `src/styles/main.css`; primitives in `src/components/ui`"                                                                                                                                                                                                                                                                                 |
| §3 Commando's              | note that `npm run format` also sorts Tailwind classes (prettier-plugin-tailwindcss)                                                                                                                                                                                                                                                                                                                                              |
| §4 Projectstructuur        | replace `styles.css # alle styling` with `styles/main.css`, `styles/tokens.css`, `styles/fonts.css`, `assets/fonts/`, `components/ui/`                                                                                                                                                                                                                                                                                            |
| §8.5 Item afvinken         | "bestaande stijl" → `UiCheck`, token `rounded-check`; never `rounded-full`                                                                                                                                                                                                                                                                                                                                                        |
| §8.6 Dubbele input         | armed styling keyed on `aria-pressed` (no `is-armed` class)                                                                                                                                                                                                                                                                                                                                                                       |
| §8.7 Laadscherm            | "bestaande `@keyframes spin`" → `UiSpinner`/`animate-spin-fast`; `.visually-hidden` → `sr-only`; `no-scroll` → `overflow-hidden`                                                                                                                                                                                                                                                                                                  |
| §8.8 Accountmenu           | `is-active` → `aria-expanded:` styling; tap highlight + focus ring live in the base layer of `main.css`                                                                                                                                                                                                                                                                                                                           |
| §8.10 Titel                | keep the rule; update the reference from `h1 { line-height }` to the token or utility                                                                                                                                                                                                                                                                                                                                             |
| §8.12 PWA, "Veilige zones" | the two `.app-shell` rules disappear; safe-area spacing tokens in `@theme`; fonts are self-hosted                                                                                                                                                                                                                                                                                                                                 |
| §8.14 Pull-to-refresh      | `overscroll-behavior` lives in the base layer; handles are recognised by `[data-drag-handle]`                                                                                                                                                                                                                                                                                                                                     |
| §8.15 Slepen               | `.dragging`/`.drop-after` → `data-dragging`/`data-drop`; `touch-none` only on the handle                                                                                                                                                                                                                                                                                                                                          |
| §9 Stijl                   | replace the "CSS: hergebruik `styles.css`" and "Bronvolgorde / dubbele definities" bullets with Tailwind rules: utilities on tokens only, no loose colours or sizes, no new custom classes, `@apply` only in the `main.css` base layer, inline `style` only for runtime values / CSS variables, pages build on `Ui*` primitives, state through ARIA/data attributes, no `tailwind-merge`; remove the "fonts nog zelf hosten" wish |
| §11 Lessons learned        | optionally: "Legacy CSS unlayered next to Tailwind wins over utilities → import it in a layer"; "Do not select on styling classes in code or specs"                                                                                                                                                                                                                                                                               |
| §12 Definition of Done     | add "visual parity checked against before-screenshots (desktop + 360px)" while the migration runs                                                                                                                                                                                                                                                                                                                                 |
| §13 Niet doen              | "`border-radius: 50%`" → "`rounded-full` op de item-checkbox"; add "geen Tailwind Play CDN / geen losse kleuren buiten tokens"                                                                                                                                                                                                                                                                                                    |

## 9. Sources

- `AGENTS.md` §2, §4, §5, §8.3–§8.15, §9, §11–§13 (Lijsten).
- `src/styles.css` (full read), `src/main.ts`, `index.html`, `vite.config.ts`, `.prettierrc.json`, `.gitignore`, `capacitor.config.json`, `android/variables.gradle`, `public/sw.js`, `package.json`.
- Templates: `App.vue`, `HomeView.vue`, `ListDetailView.vue`, `ListCard.vue`, `ItemRow.vue`, `ConfirmDeleteDialog.vue` (incl. scoped style), `AuthCard.vue`, `LoginView.vue`, `PasswordInput.vue`, `SyncIndicator.vue`, `PullToRefresh.vue`, `SplashView.vue`; `useDragReorder.ts:39`, `PullToRefresh.vue:20-34`, `App.vue:127`.
- Specs: selector and `classes()` usage across `src/**/*.spec.ts` (grep).
- `node_modules/{vite,vitest,@vitejs/plugin-vue,prettier,jsdom}/package.json`; `npm view` for `tailwindcss`, `@tailwindcss/vite` (peer vite ^8), `prettier-plugin-tailwindcss`, `class-variance-authority`, `tailwind-variants`.
- `../uur-wijzer` (main): `AGENTS.md` "Vormgeving", `src/styles/{main,tokens,fonts}.css`, `src/styles/tokens.spec.ts`, `src/components/ui/{UiButton,UiIconButton,UiDialog}.vue`, `UiButton.spec.ts`, `vite.config.ts`, `package.json`; git log for PRs #35/#40/#41/#51/#73/#74; `gh issue view 20–25` (titles and the #20 body template).
- Not verified this session (from Tailwind v4 docs knowledge): the exact browser baseline, the `pointer-coarse` variant (v4.1+), `@layer` ordering before `@import "tailwindcss"`, and the preflight details. Verify these in issue 1.
