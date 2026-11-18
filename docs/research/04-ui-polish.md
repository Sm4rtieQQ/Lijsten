# 04 - ui-polish: app icon glyph size, long titles, status pill vs title

Checkout: detached at `origin/master` 0de29af (release 1.5.0). Read-only research; nothing built, nothing run in a browser or on a device. Layout claims are **derived from CSS** unless stated otherwise; pixel widths of text are estimates (no font metrics measured).

## 1. Question

Three user points:

1. The list glyph in the app icon is too big and is cut off by rounded masks on some devices.
2. Long titles are truncated on the overview page but not on the list page; they should behave the same.
3. The status pill must not hide parts of the title on the list page; explain why it does and give options.

Scope: icon sources (PWA SVG/PNG, Android adaptive icon), `ListCard.vue`, `ListDetailView.vue`, `SyncIndicator.vue`, AGENTS.md §7.4, §8.10, §8.12, §9.

## 2. What I found

### 2.1 App icon

Sources:

- Android: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` (adaptive icon: background `@color/ic_launcher_background` = `#D9C6B0` in `values/ic_launcher_background.xml`, foreground `@drawable/ic_launcher_foreground`). The manifest uses them since #11 (`AndroidManifest.xml:6`, `:8`; commit db0fe3f). No `mipmap-*dpi` PNGs and no monochrome layer exist.
- Foreground: `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`, a 108x108 vector with the glyph at scale 1.0, no group/inset.
- PWA/iOS: `public/icons/icon.svg` (glyph group `scale(1.25)`, line 3) and `public/icons/icon-maskable.svg` (`scale(0.8)`, line 3), both on a 108 viewBox with a full-bleed `#d9c6b0` rect. PNGs rasterised from them: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (from `icon.svg`) and `icon-512-maskable.png` (from `icon-maskable.svg`). `public/favicon.svg` is the bare glyph, unmasked, not affected.

Glyph geometry (identical path in all files): document outline `M31,22 ... Z`, bounding box x 25-83, y 22-86 (58 x 64 units), three corners rounded with radius 6, bottom-right folded. Icon centre is (54,54). The farthest glyph points from the centre are the three rounded corners: arc centre at distance sqrt(23^2 + 26^2) = 34.7, plus radius 6 = **40.7 units**. The folded corner reaches 37.2.

**Android (the reported defect).** Adaptive icon rules: 108dp canvas, launcher shows a 72dp viewport through its mask, only the central **66dp circle (radius 33dp)** is guaranteed visible.

|                                    | radius from centre |
| ---------------------------------- | ------------------ |
| Glyph corners, current (scale 1.0) | 40.7dp             |
| Full circle mask (72dp viewport)   | 36dp               |
| Guaranteed safe zone               | 33dp               |

So the glyph exceeds the safe zone by 7.7dp and a plain circular mask by 4.7dp: three corners of the document are cut on circle-mask launchers, while squircle / rounded-square masks keep more of the corner area and show it whole. That matches "on some devices". The largest scale that fits the safe circle is 33 / 40.7 = **0.81**.

Correction to `02-app-icon.md`: it states "the adaptive safe zone is the central 66dp (21-87), so the glyph fits". That treats the safe zone as a square; it is a circle, and the glyph's corners are outside it.

**PWA maskable** (`icon-512-maskable.png`, measured with ImageMagick `-trim`: glyph 221x243 px at +146+135 of 512). Safe zone is a circle of radius 40% = 204.8 px; the glyph corners reach 40.7 x 0.8 / 108 x 512 = 154 px. Fits with room to spare. No change needed.

**PWA "any" and iOS** (`icon-512.png`: glyph 345x381 at +84+66; `apple-touch-icon.png`: 122x134 at +29+23 of 180; `icon-192.png`: 130x143 at +31+25). The glyph fills 67% x 74% of the square, 13% margin top and bottom. iOS rounds the corners (radius about 22% = 40 px at 180): the glyph's own rounded corner stays about 17 px from the mask corner centre, well inside the 40 px arc, so it is **not clipped** (derived). "Any" icons are not masked by Chrome. It is however visibly larger than the Android icon will be after the fix (see option B).

Regeneration (AGENTS.md §8.12, line 372: change the SVG and rasterise with ImageMagick, never hand-edit PNGs; `CACHE_VERSION` in `public/sw.js:11` is `lijstjes-v3` and must be bumped when the precached icons at `sw.js:18-21` change). The Android foreground is a source vector under `res/`, edited directly; only visible after an Android build, which is gated (§10.2). Never touch `android/app/src/main/assets/public/` (§10.1).

### 2.2 Titles: overview vs list page

Overview card, `src/components/ListCard.vue:95-98`: a `<span>` with `truncate` (one line, ellipsis), 23px display font, inside a row with `pr-[38px]` (room for the delete button) and the 22px drag handle + 9px gap (`:83`). Title width (derived): at 360px wide, shell padding 18px each side (`App.vue:239`) gives a 324px card, minus 42px card padding, 38px, 31px = about **213px, roughly 18 characters**. On desktop two columns (`HomeView.vue:253`) give about 234px, roughly 20 characters. Titles can be 60 characters (`HomeView.vue:309`, `ListDetailView.vue:212`). The full title is only in the card's `aria-label` (`ListCard.vue:78`); there is no tooltip.

List page, `src/components/ListDetailView.vue:207-215`: a single-line `<input>` (`UiInput` variant `bare`, `UiInput.vue:32`), 39px display font, 34px at 520px and below. An input never wraps and has no ellipsis: text that does not fit is **cut at the right edge without any mark**; the rest is reachable only by moving the caret. Width (derived): 360px gives 324px minus the 16px gap and the pill. With the pill collapsed (16px) about 292px, roughly 17 characters; with the pill expanded about 190px, roughly 11 characters. Desktop (shell max 760px, `App.vue:239`): about 672px collapsed, roughly 34 characters.

So today **both** cut long titles: the overview with an ellipsis, the list page silently (and on a phone at about the same length). Neither shows a 60-character title in full. "Same functionality" is therefore a choice, see options and open question 2.

### 2.3 Status pill hides part of the title

Layout: the title row is `<header class="flex items-start justify-between gap-4">` (`ListDetailView.vue:204`) with two children: the title block `relative min-w-0 flex-1` (`:205`) and `<SyncIndicator />` (`:220`). The pill is not shrinkable (its label is `whitespace-nowrap flex-none`, `SyncIndicator.vue:94`), so the title block gets whatever is left.

Cause (derived): the pill **changes width** and the title input pays for it.

- Expanded, the pill shows dot + label + time at 8px/7px text (`SyncIndicator.vue:80`, `:96-97`): roughly 95px (`In wachtrij`), 117px (`Gesynchroniseerd`) or 148px (`Fout bij synchroniseren`) wide.
- Collapsed, it is 16px (`min-w-11` = 44px box minus the 2 x 14px negative margin, `:80`, `:87`).
- It expands on every status change (`:20-33`) and only `synced` and `error` collapse after 1.5 s (`:26`). `pending` never collapses, and §7.3 keeps the pill on `In wachtrij` for up to 30 s after every change (2 min while editing continuously). So while someone ticks items, the pill is expanded most of the time.
- Each expansion takes 80-130px from the title input. The input cannot wrap or show an ellipsis, so the tail of the title disappears and comes back when the pill collapses. On a 360px phone the title drops from about 17 to about 11 visible characters.

The 44x44 hit area is **not** the cause: the transparent border reaches 14px left of the visible pill, inside the 16px gap (`gap-4`), so it does not cover the title box (2px to spare) and does not steal taps from it. Vertically it extends 13px above and below the pill, over empty space.

Two more observations:

- AGENTS.md §7.4 (line 212) says the pill sits in the detail view "naast de terugknop" (next to the back button). In the code it sits next to the **title**; the back button is in a second header (`ListDetailView.vue:223-236`) that already has `flex items-center justify-between` with only one child. It has been like this since the initial commit (994c896), so doc and code have always disagreed.
- Same mechanism on the overview: `HomeView.vue:184-193`. The `h1` "Mijn lijstjes" has `overflow-hidden text-ellipsis whitespace-nowrap` (`:187`), and the pill sits in the right-hand group. At 360px the heading needs roughly 215px and has about 260px with the pill collapsed but only about 160px with it expanded, so the heading is likely shortened to "Mijn lij…" while the pill is expanded (derived, not seen). Not one of the three points; noted for the pill decision.

Tests: `SyncIndicator.spec.ts` checks label, dot, collapse timing; `ListDetailView.spec.ts:128` selects the title with `input[aria-label="Naam van het lijstje"]`. No test covers layout.

## 3. Options

### 3.1 Icon

**A. Shrink the Android foreground to scale 0.75 (required fix).** Wrap the paths of `ic_launcher_foreground.xml` in `<group android:pivotX="54" android:pivotY="54" android:scaleX="0.75" android:scaleY="0.75">`. Corners then reach 30.5dp (inside the 33dp safe circle, 2.5dp spare); the glyph is 43.5 x 48dp, which meets the Android guideline of a 48dp logo. Anything up to 0.81 fits; 0.75 leaves a margin. One file, effort S. Visible only after an approved Android build.

**B. A plus align the PWA "any"/iOS icon: `icon.svg` scale 1.25 to 1.1.** Not needed against clipping. It makes the glyph occupy the same share of the visible icon as Android after A (Android: 48dp of the 72dp viewport = 67% high; `icon.svg` at 1.1 = 65%, now 74%). Then re-rasterise `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` from the SVG and bump `CACHE_VERSION` to `lijstjes-v4`. `icon-maskable.svg` stays at 0.8. Effort S.

**C. A plus a monochrome layer / legacy PNG fallback for API 24-25.** Out of scope for this complaint; mentioned in `02-app-icon.md` (options B and C there) and still open.

### 3.2 Titles (what "same" means)

**T1. Show the whole title on both pages (wrap).** Card: replace `truncate` with wrapping (`break-words`); the card grows, the grid row follows. List page: the title must become a wrapping field. An `<input>` cannot wrap, so use a `<textarea rows="1">` that grows with its content (CSS-only mirror technique: textarea and a hidden copy of the text in the same grid cell; no DOM measuring, fits §5), Enter commits instead of adding a line, newlines stripped. Needs a new `UiInput` variant or a small `UiTextarea` primitive (§9), spec selector update (`ListDetailView.spec.ts:128`). 60 characters is at most about 4 lines on a 360px phone on either page. Effort M. Pros: nothing is ever hidden. Cons: taller cards and header for long titles; a new primitive.

**T2. One line with an ellipsis on both pages.** Card unchanged. List page: add `text-ellipsis` to the title input; browsers show the ellipsis while the input is not focused and the full scrollable text while editing. Effort S (one class, no new component). Pros: tiny, consistent look. Cons: long titles stay unreadable on both pages unless you tap into the field.

**T3. Wrap on the overview with a 2-line clamp, ellipsis on the list page.** A middle road; still two different behaviours, so it does not answer "the same".

### 3.3 Status pill

**P1. Move the pill to the back-button row.** Move `<SyncIndicator />` from the title header (`ListDetailView.vue:220`) into the second header (`:223`), which already spreads its children left and right. The title gets the full width and never changes width again. Variant P1b: also put that row above the title (back left, pill right, title below), so the pill is at the very top right exactly like on the overview. Files: `ListDetailView.vue` (move one line; P1b also swaps the two headers and their margins), AGENTS.md §7.4 line 212. Effort S. Pros: removes the cause completely; the pill keeps its full behaviour and 44px hit area; §7.4 already says "next to the back button", so P1 makes the code match the doc (only "on the same spot on every screen" needs a word for P1, nothing for P1b). Cons: in P1 the pill sits one row (about 60px) lower than on the overview; P1b changes the order of the page head, which is a visible design change.

**P2. Keep the pill in the title row, dot only on the list page.** A `compact` prop that keeps the pill collapsed in every state (spinner while syncing). The title loses a fixed 32px and no longer jumps. Files: `SyncIndicator.vue`, `SyncIndicator.spec.ts`, `ListDetailView.vue`, AGENTS.md §7.4 (label and time not shown on the list page). Effort S-M. Pros: pill stays where it is. Cons: status is colour only on that page (the `aria-label` and tooltip remain), no "In wachtrij"/error text, no sync time; two behaviours of one component.

**P3. One pill for the whole app, fixed in the top-right corner.** Render `SyncIndicator` once in `App.vue` with `fixed` and the safe-area tokens, out of the layout flow on both pages. Files: `App.vue`, `HomeView.vue`, `ListDetailView.vue`, AGENTS.md §7.4. Effort M. Pros: really the same spot everywhere, also fixes the "Mijn lijstjes" case. Cons: it floats over content while scrolling, has to avoid the account button on the overview and the verified banner (`App.vue:243`), and an expanded pill can still cover the title's end on a phone unless space is reserved. Most risk.

**P4. Keep the layout, let the title wrap (T1 only).** The title would no longer lose text, but it would re-wrap and push the page down and up every time the pill expands and collapses. Not a fix on its own.

## 4. Recommendation

- Icon: **A and B together** (A fixes the clipping; B keeps the web/iOS icon in step so the glyph looks equally sized everywhere).
- Pill: **P1** (move the pill to the back-button row, keep the row order). Smallest change, removes the cause instead of managing it, keeps every documented pill behaviour, and is what §7.4 already describes. P1b is a design preference the user can add.
- Titles: **T1** (whole title on both pages). The complaint is about text being cut; T2 makes both pages equal by cutting on both.
- Order: pill first, titles second. The width available to the title depends on where the pill ends up, and with the pill out of the title row the title work needs no allowance for a neighbour that changes width.

## 5. Risks

- No device or browser check was possible; all layout numbers are derived. Verify with screenshots at 360px and desktop, before and after (§9).
- Icon: launchers cache icons, an installed PWA keeps its old icon until reinstall; Android result visible only after an approved build (§10.2). API 24-25 still has no launcher icon resource (pre-existing, see 02).
- T1: a textarea accepts pasted newlines; they must be stripped, and Enter must commit. Taller cards change the grid and the drag ghost (`ListCard` is also the ghost, §8.15). The `maxlength="60"` and rename-on-change behaviour must stay. iOS Safari behaviour of the growing field is unverified.
- T2: ellipsis on a non-focused input is browser behaviour (Chrome, Firefox, Safari support it); unverified in the Android WebView.
- P1: `ListDetailView.spec.ts` does not assert the pill's position, so tests should stay green; pull-to-refresh and back handling are unaffected. P3 would touch stacking order and safe areas.
- No data, security, migration or performance impact in any option.

## 6. Open questions

1. Icon: also resize the PWA/iOS icon (option B), or Android only? Suggested: both.
2. Titles: what should "the same" be: whole title visible on both pages (T1) or one line with an ellipsis on both (T2)? Suggested: T1.
3. Pill: which option? Suggested: P1. If P1: keep the back row below the title (P1) or move it above (P1b)? Suggested: keep it below.
4. The overview heading "Mijn lijstjes" is probably shortened while the pill is expanded on a narrow phone (derived). Want that looked at too? Suggested: check on a device after the pill change; a separate small issue if confirmed.

## 7. Issues created

All three assigned to the user, label `bug`. Suggested order: #45 independent; #46 before #47.

- #45 App icon: list glyph cut off by rounded masks: https://github.com/Sm4rtieQQ/Lijsten/issues/45
- #46 List page: status pill hides the end of the title (options P1-P4, recommendation P1, user picks first): https://github.com/Sm4rtieQQ/Lijsten/issues/46
- #47 Long list titles: same behaviour on overview and list page (T1 or T2, user picks; "After #46"): https://github.com/Sm4rtieQQ/Lijsten/issues/47

## 8. Sources

AGENTS.md §5, §7.3, §7.4, §8.10, §8.12, §9, §10.1, §10.2; `docs/research/02-app-icon.md`; `android/app/src/main/AndroidManifest.xml`; `android/app/src/main/res/{mipmap-anydpi-v26,drawable-v24,values}`; `public/icons/*` (ImageMagick `identify` and `-trim` bounding boxes, output not saved), `public/favicon.svg`, `public/manifest.webmanifest`, `public/sw.js`; `src/components/{ListCard,ListDetailView,SyncIndicator,HomeView}.vue`, `src/components/ui/UiInput.vue`, `src/App.vue`, `src/styles/{main,tokens}.css`; `src/components/{SyncIndicator,ListDetailView}.spec.ts`; git: 994c896, db0fe3f; `gh issue list --state all` (no duplicates; #11 closed is the earlier icon fix).
