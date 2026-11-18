# 02 - app-icon: beige icon on white surround

## 1. Question

The app icon shows a beige rounded square on a white background. The user wants beige to fill the whole icon. Find the cause per platform, the beige hex, the regeneration route, options, and the files that would change. Read-only research; nothing built or exported.

## 2. What I found

Beige hex: icon background is `#D9C6B0` (everywhere: SVGs, Android values, vectors). The app UI paper colour is `--paper: #f7f1e8` (`src/styles.css:2`), also used as manifest `background_color`/`theme_color` and `index.html:8`. These are two different beiges; the icon uses the darker `#D9C6B0`. (Which one the user means by "beige" is an open question.)

### Android (root cause, verified by reading; not verified on a device)

- `android/app/src/main/AndroidManifest.xml:6` and `:8`: `android:icon="@drawable/ic_launcher"` and `android:roundIcon="@drawable/ic_launcher"` (since the initial commit 994c896).
- `res/drawable/ic_launcher.xml` is a plain, non-adaptive `<vector>` (108dp, full-bleed `#D9C6B0` rect plus document glyph). It is NOT an `<adaptive-icon>`.
- On API 26+ a non-adaptive icon is treated as a legacy icon: the launcher shrinks it and places it on its own white backdrop with a squircle mask. That is exactly "beige rounded square on white". minSdk is 24 (`android/variables.gradle:2`), targetSdk 36.
- The proper adaptive icons already exist but are unused: `res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` (background `@color/ic_launcher_background` = `#D9C6B0` from `res/values/ic_launcher_background.xml`, foreground `@drawable/ic_launcher_foreground` in `res/drawable-v24/ic_launcher_foreground.xml`, glyph only, no bg rect).
- `res/drawable/ic_launcher_background.xml` is the leftover Capacitor template (teal `#26A69A` with grid lines) and is unused (the adaptive xml uses `@color/...`, not `@drawable/...`).
- There are no `mipmap-*dpi` PNGs, so API 24/25 devices have no legacy mipmap fallback (`@mipmap/ic_launcher` would have no resource below v26 either; `mipmap-anydpi-v26` only applies to 26+).
- Not set: `<monochrome>` (Android 13 themed icons), so themed-icon mode falls back to a legacy-style tile.
- The foreground glyph spans x 25-83, y 22-86 of 108; the adaptive safe zone is the central 66dp (21-87), so the glyph fits.
  - **Correction (#45):** wrong. The safe zone is a 66dp *circle* (radius 33dp), not a square. The glyph's rounded corners reach 40.7dp from the centre, so circle-mask launchers cut them off. Fixed in #45 by scaling the foreground glyph to 0.75 (corners at 30.5dp).
- Splash: `res/drawable/splash.png` and variants are white (pixel 0,0 = 255,255,255), referenced by `AppTheme.NoActionBarLaunch` (`styles.xml`). This is a separate white surface (launch screen), not the icon; mention only so the user knows if "white" is also seen there.

### PWA (Chrome/Android install, desktop)

- `public/manifest.webmanifest`: icons 192 and 512 `purpose: any`, 512 `purpose: maskable`; `background_color`/`theme_color` `#f7f1e8`.
- `public/icons/icon.svg` and `icon-maskable.svg` both start with a full-bleed `<rect fill="#d9c6b0">`; glyph scaled 0.8 (any) / 1.25 (maskable, note: 1.25 enlarges the glyph rather than adding safe-zone padding; glyph then spans about x 17-91 and may clip under a circular mask; unverified visually).
  - **Update (#45):** the scales were swapped since: `icon-maskable.svg` is now 0.8 (inside the 80% safe circle) and `icon.svg` ("any"/iOS) went from 1.25 to 1.1 in #45.
- Rasterised PNGs verified with ImageMagick: all four (`icon-192`, `icon-512`, `icon-512-maskable`, `apple-touch-icon`) have opaque `#D9C6B0` at pixel (0,0) and no alpha. So the PNGs are already full-bleed beige.
- Chrome on Android picks the maskable icon when present, else wraps `any` icons in a white circle/square backdrop. The manifest has a maskable entry, so a correct PWA install should already be full beige; if the user's PWA still shows white, it is likely a stale installed copy or old cache (sw.js `CACHE_VERSION = "lijstjes-v1"`, `public/sw.js:11`, precaches icons at `:17-21`).
- `public/favicon.svg`: transparent, glyph only (no beige). In a browser tab this shows the glyph on the tab background; it is not a launcher icon. Optional to add the beige rect.

### iOS home screen

- `index.html:11` `apple-touch-icon` -> `/icons/apple-touch-icon.png`: 180x180, opaque beige, no alpha. iOS rounds the corners itself; no white or black surround expected. Nothing to fix.

### Regeneration route

- AGENTS.md §8.12 (line 353): PNGs are rasterised from `icon.svg`/`icon-maskable.svg` with ImageMagick (`convert`/`magick` are installed). Never hand-edit PNGs.
- AGENTS.md §10.1: never hand-copy into `android/app/src/main/assets/public/` (does not currently contain icons anyway).
- Android resources are source files in `android/app/src/main/res` (tracked in git) and are edited directly; only a rebuild/export (gated, §10.2) makes them visible.

## 3. Options

**A. Point the manifest at the existing adaptive icons (recommended).**
Change `android:icon` to `@mipmap/ic_launcher` and `android:roundIcon` to `@mipmap/ic_launcher_round`. Result on API 26+: beige `#D9C6B0` background layer fills the whole masked icon, glyph on top, no white. Delete the unused `drawable/ic_launcher.xml` and the teal `drawable/ic_launcher_background.xml` (optional cleanup). Effort: S (2 attribute edits + optional deletes). Con: API 24-25 has no fallback (see option C).

**B. A plus a monochrome layer for Android 13 themed icons.**
Add `<monochrome android:drawable="@drawable/ic_launcher_monochrome"/>` to both adaptive xmls and a glyph-only vector. Effort: S-M. Nice to have; not requested.

**C. A plus legacy mipmap PNG fallback for API 24-25.**
Generate `mipmap-mdpi..xxxhdpi/ic_launcher.png` (48/72/96/144/192) from `icon-maskable.svg` with ImageMagick. Effort: M. Only needed if API 24-25 devices matter; AGENTS.md does not say. Alternative: raise minSdk to 26 (not recommended just for this).

**D. Only tidy the web assets (favicon beige rect, manifest tweaks).**
Does not fix the reported symptom (Android launcher). Effort: S. Do not pick alone.

## 4. Recommendation

Option A (optionally with B). It fixes the root cause (the manifest references a non-adaptive drawable, so the launcher adds a white backdrop) using resources that already exist and already carry the right beige. No PWA/iOS asset change is needed; no PNG regeneration, no `sw.js` bump needed for A. Only if the user also wants a web change (e.g. favicon, a different beige, a safe-zone fix for `icon-maskable.svg`) do the SVG edit, ImageMagick re-raster and `CACHE_VERSION` bump (`lijstjes-v1` -> `lijstjes-v2`) apply.

Files that would change for A: `android/app/src/main/AndroidManifest.xml` (lines 6, 8); optionally delete `android/app/src/main/res/drawable/ic_launcher.xml` and `res/drawable/ic_launcher_background.xml`.

## 5. Risks

- Visible only after an Android rebuild/export, which is gated on user approval (AGENTS.md §10.2). Nothing to build now.
- Launchers cache icons; after installing the new build the old icon may linger until the app is reinstalled or the launcher restarts/cache clears.
- The adaptive mask crops the outer ~18dp; the glyph is within the safe zone, so the document should not clip (visual check on a device advised).
- Deleting `drawable/ic_launcher.xml` while the manifest still references it breaks the build; do both in one change.
- PWA: users with an installed copy keep the old icon until reinstall; precache is in `lijstjes-v1`.
- `icon-maskable.svg` scale 1.25 may clip the glyph under a circular mask (unverified); only relevant if the PWA is touched.
- No tests cover icons; verification is visual.

## 6. Open questions

1. Which beige: keep icon `#D9C6B0` (current, used everywhere) or switch to the UI paper `#f7f1e8`? Suggested: keep `#D9C6B0`.
2. Is "white surround" seen on the Android app (launcher), a PWA install, or both? Suggested: Android app; the PWA/iOS assets are already full-bleed.
3. Do API 24-25 devices matter (option C)? Suggested: no.
4. Add a monochrome themed icon (option B)? Suggested: not now.
5. Should the white splash (`drawable/splash.png`) also become beige? Suggested: separate issue.

## 7. Proposed issue

**Title:** Android app icon: make beige fill the whole launcher icon

**Body:** The Android launcher shows the icon as a beige rounded square on white. `AndroidManifest.xml` points `android:icon`/`roundIcon` at `@drawable/ic_launcher`, a non-adaptive vector, so Android adds a white legacy backdrop. The adaptive icon (`mipmap-anydpi-v26`, beige background `#D9C6B0` + glyph foreground) already exists but is unused. Point the manifest at it and remove the unused template drawables. PWA and iOS icons are already opaque full-bleed beige and need no change.

**Acceptance criteria:**

- `android:icon="@mipmap/ic_launcher"` and `android:roundIcon="@mipmap/ic_launcher_round"`.
- Unused `drawable/ic_launcher.xml` and `drawable/ic_launcher_background.xml` removed; Gradle build still succeeds.
- After an approved Android export, the launcher icon is fully beige with the document glyph, no white edge, in square and round launcher masks.
- No PNG hand-edits; no files under `assets/public` touched; PWA assets and `sw.js` unchanged.

**Files:** `android/app/src/main/AndroidManifest.xml`; delete `android/app/src/main/res/drawable/ic_launcher.xml`, `android/app/src/main/res/drawable/ic_launcher_background.xml`.

## 8. Sources

AGENTS.md §8.12, §10.1, §10.2; `AndroidManifest.xml`; `android/app/src/main/res/{drawable,drawable-v24,mipmap-anydpi-v26,values}`; `android/variables.gradle`; `public/manifest.webmanifest`, `public/icons/*` (ImageMagick `identify`/pixel checks), `public/favicon.svg`, `public/sw.js`; `index.html`; `src/styles.css`; git log (994c896 initial commit). Not verified on a device.
