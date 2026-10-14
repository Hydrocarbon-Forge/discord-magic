# VERIFY_P1 — loader + F1 + F2, copy-verified (live apply NOT run)

Date: 2026-10-14. Scope: SPEC_P1.md exactly (no P2/P3 beyond the physics stub).
Live install was **never touched**: `scripts/apply.sh` / `scripts/restore.sh`
refuse the live `core.asar` without `--live-ok` (exit 3), and neither script
was run with that flag this wave. Live sha256 before and after this run:
`c3ef8e35dd6345d7b5e58dfb6894a923344f0439cd051fa802413bef84616372` (unchanged).

## 1. Patch logic on a COPY of core.asar

- Copied live `core.asar` → `scratch/p1-verify/core-copy.asar` (`cmp`-identical).
- Ran the exact `apply.sh` logic against the copy:
  `scripts/apply.sh --core scratch/p1-verify/core-copy.asar
  --backup-dir scratch/p1-verify/backups --sidecar-dir scratch/p1-verify/sidecar`
- Anchor (single anchored replace in extracted `bundle.js`):
  `loadingDragCssPromises.push(mainWindow.webContents.insertCSS("body { -webkit-app-region: drag; }").catch(()=>null))`
  - pre-patch: anchor **1**, marker `discord-magic-loader-v1` **0**
  - post-patch: anchor **1**, marker **1**
- Re-extracted the repacked copy with `asar`: anchor 1, marker 1,
  sidecar `require(.../.config/discord-magic/loader-v1.js)` + `.attach(mainWindow)` present.
- Patched copy repacks cleanly (`asar list` OK); sha
  `5652dea2…0e8ab` (differs from original, as expected).
- Idempotency: second `apply.sh` run exits 0 (`already patched`), creates
  **no** new backup (idempotency is checked before the backup step).
- Sidecar install verified: `loader-v1.js` + `payload/{mod,stores,physics}.js` +
  `payload/css/{glass,foil}.css` land in the sidecar dir.
- Loader unit checks: `node --check` clean on all JS; `resolvePayloadDir()`
  + `buildBootstrap()` return a 22 KB bootstrap embedding both stylesheets.

## 2. Backup/restore round-trip (on the copy — lossless)

Single cycle, one backup: apply (backup `core.asar.<ts>`, `cmp` byte-for-byte)
→ `scripts/restore.sh --core <copy> --backup-dir <backups>` →
restored sha256 `c3ef8e35…16372` **equals** the original. `ROUNDTRIP-LOSSLESS`.
(`restore.sh` picks the newest backup; `cmp` verifies after every restore.)

## 3. Visual logic (no live client)

Fixture: `test/fixture.html` (representative DOM: `[data-list-item-id]` channel
+ member rows, `[data-list-id]` chat log, `.positionedLayer__*` popout) driven
by the REAL payload files in loader order (jsdom test evals the exact
`buildBootstrap()` string the loader injects; the screenshot page loads the
same files via `<link>`/`<script>`).

`npm run test:p1` → **25/25 PASS** (`P1-FIXTURE: ALL PASS`), covering:
- bootstrap injects + re-run is a no-op; `#discord-magic-ready` marker present
- glass on **5** surfaces (≥3 required), glass+jelly on 4 rows
- foil stage wraps the popout root (card + `.dm-foil-sheen` inside
  `.dm-foil-tilt`; wrap targets the card, never the layer container)
- synthetic `mousemove` sets `--dm-rx/--dm-ry` (10.80°/10.80°, within ±12°),
  sheen `background-position: 95% 5%` tracks the cursor; `mouseleave` resets
- MutationObserver re-attaches glass to late-added rows and wraps late popouts
- `physics.installSpring()` no-op + `dispose()`; store handles exposed
- React-safety spot check (row content untouched; class-only writes)

Bug found + fixed by the fixture: unconditional `classList.add` in the sweep
path ping-ponged the observer under jsdom (no-op sets still queue attribute
records there). All class writes are now `contains`-guarded (`addClass()`),
so sweeps are write-free when state is current — safe in every DOM.

Screenshot: `test/evidence/fixture.png` (Chromium headless, 1280×800) —
glass borders/glow on all three surfaces + iridescent foil sheen on the card.

## 4. Human-gated remainder (NOT done — needs user + C6)

1. `scripts/apply.sh --live-ok` against the real
   `~/.config/discord/.../discord_desktop_core/core.asar` (backs up to
   `backups/`, installs sidecar to `~/.config/discord-magic/`).
2. Relaunch Discord (default profile), confirm `#discord-magic-ready`,
   glass on 3+ surfaces, popout tilt + sheen + etched text, no console errors.
3. `scripts/restore.sh --live-ok` smoke test (revert → stock checksum).

## 5. Scope notes

- File layout follows SPEC_P1.md (`payload/stores.js`, `payload/physics.js`
  at payload root), not PLAN.md §3's `payload/js/` paths — one-line deviation,
  loader resolves the SPEC_P1 paths.
- `test/` + `package.json`/`package-lock.json` (jsdom) are verification
  tooling for safety-gate item 3, not product scope. No P2/P3 code.
