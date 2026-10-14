# discord-magic — Wave 2: live-diagnosis + selector fix + macOS liquid-glass redesign

**Model:** `opencode/muse-spark-1.3-contributor-free#xhigh` · **Repo:** `~/HydrocarbonForge/Projects/discord-magic`
Read `SPEC.md`, `recon/RECON.md`, `PLAN.md`, `VERIFY_P1.md` first.

## Context — why you're here

The live `core.asar` is **already patched** (user ran `apply.sh --live-ok`; live sha `5652dea2…`, backup in `backups/`). Discord was relaunched and the user reports **no visible difference and no foil-tilt profile popouts**. C6's verified diagnosis:

1. **Injection anchor works as designed** (confirmed in the live patched bundle): `mainWindow.webContents.on("did-finish-load", …)` → `require("<home>/.config/discord-magic/loader-v1.js").attach(mainWindow)` — `mainWindow` is in scope at the anchor. So the bootstrap most likely DID run.
2. **Root cause — stale selectors (verified against the real build 637268 bundle):** in `client/web.94f77ed563542b5d.js`, `data-list-id` values are **dynamically constructed**: `function a(e,t){return\`${e}___${t}\`}` (i.e. `scope___channels`, `scope___members`, …). The literal values `guild-channels` / `chat-messages` / `members` do NOT exist as DOM attribute values (the string "guild-channels" appears only in API paths). Additionally: `aria-label="Channels"`, `aria-label="Members"`, and `role="log"` are absent from the bundle, while `data-list-item-id`, `positionLayer` (4 files) and `positionedLayer` (1 file) DO exist.
   → Net effect: even with the bootstrap running, `applyGlass()` matches nothing (rows partially work via `[data-list-item-id]`, but the 3 surface-level `.dm-glass` rules in `glass.css` key off the dead selectors), and the surface-level CSS in `glass.css` therefore never fires.
3. **Uncertainty that you must resolve with evidence, not guesses:** whether the profile popout host class in this build is `positionLayer`/`positionedLayer` (or something else, e.g. `popoutLayer`/`accountPopout`-family) — verify against the real bundle assets in `/home/bsmt-pc/.hermes/cache/scratch/opencode/discord-recon/` (`client/*.js`, `webassets/*.js`, `app-shell.html`). Label which claims come from the bundle and which are inferred.

## Tasks

### A. Live proof (the one thing C6 can't see from here)
Add a **persistent, readable diagnostic** so the next Discord launch proves bootstrap state without DevTools:
- On injection (in `payload/mod.js`), after ready, write a compact JSON **report** into an attribute on the marker node: `#discord-magic-ready[data-dm-report]` — fields: `v`, `ts`, `ready`, `surfacesMatched` (per-selector counts), `rowsMatched`, `layersFound` (class names actually seen among `*[class*="Layer"]`), `cssInstalled` (both style ids present), `storeHandles` (which of MediaEngineStore/VoiceStateStore resolved), `errors`.
- Also keep `window.__DM.report()` returning the same object (DevTools), and `console.log("[discord-magic]", report)` on each (re)injection.
- Update the marker writer in `mod.js` accordingly; re-verify with the jsdom fixture (`npm run test:p1` must still pass — update expected values, don't weaken assertions).

### B. Selector fix (root cause)
Make selection **build-agnostic** (hashes AND scopes rotate):
- Surfaces: `[data-list-id]` elements — but pick the RIGHT ones by inspecting the actual id patterns in the real bundle (read the `a(e,t)` construction call-sites: which `(scope,name)` pairs exist — e.g. `scope___channels`? `guild___channels`?). Select by the stable part (e.g. `[data-list-id$="___channels"]`, or the set of observed names), falling back gracefully when unknown.
- Rows: keep `[data-list-item-id]` (verified present).
- Popout/layer host: verify the real class family in the bundle (`positionLayer` vs `positionedLayer` vs others) and match with `[class*="Layer"]`-style substring selectors, then confirm the wrapped child is the card (not the container). Check the `app-shell.html` / chunk assets for the profile-popout container class (`profilePopout`-family) and use it as a secondary, more precise target if present.
- CSS: move the dead literal selectors in `glass.css` to the same attribute-based rules (CSS attribute suffix/substring selectors), keeping the design tokens (task C) intact.
- Update `test/fixture.html` to model the REAL shapes (dynamic `data-list-id` values, real layer class names) — the fixture is currently the wrong shape, which is exactly why P1's tests passed while the live client showed nothing.

### C. Design study + visual upgrade — **macOS Liquid Glass** (user's explicit style target)
The user wants the look of **macOS 26 "Liquid Glass"** (Apple's 2025 design language): think Apple WWDC 2025 keynote UI, the new macOS menu bar / Control Center — **heavy frosted panels with visible depth, specular top-rim light, inner glow, soft refraction halo, tinted (not pure white) tint, large radii**. Do a short design study (web references are fine) and then rework `glass.css` + `foil.css` to that language:
- Surfaces: multi-layer treatment — outer refraction halo (large soft box-shadow + inset 1px inner rim `inset 0 1px 0 rgba(255,255,255,.5)`), specular top-edge highlight strip (gradient pseudo-element), tinted frosted background (`backdrop-filter: blur(20-24px) saturate(180%)` + subtle hue tint), gentle inner shadow for depth. Should be **unmistakably visible** at a glance — the current P1 treatment was too subtle; push intensity, keep it tasteful (no neon).
- Rows/jelly: keep the squash, tune the spring bezier to feel like glass (less rubbery).
- **Foil tilt cards (profile popouts)**: make them unmistakable — stronger iridescent conic sweep (bigger hue range, animated slow rotation via `@property` if supported, else JS-driven), stronger etched-metal name treatment, a clear holographic rim glow that shifts with tilt. If the popout host turns out to be a modal (View Profile) rather than the hover layer, cover both paths (hover popout layer + profile modal container class from the bundle).
- Ship a **visible proof-of-life**: a tiny always-present badge (bottom-right, e.g. a small "◆ liquid" chip, draggable, double-click to hide, stored in `localStorage`) so the user can see the mod is active without hunting. Subtle, not intrusive.
- Keep the hard rules: class/attribute-only writes, no React subtree restructuring, transform/opacity/box-shadow/backdrop-filter only, `prefers-reduced-motion` respected.

### D. Evidence this run (no live apply by you — the live bundle is already patched)
- `npm run test:p1` (updated fixture) all green.
- Playwright/headless-Chromium fixture screenshot of the NEW design (update `test/evidence/fixture.png`) showing the liquid-glass surfaces + foil card.
- **Copy-check the new payload against the already-patched live asar:** extract live `core.asar` to a temp dir, confirm the marker is present and the sidecar `require` target (`~/.config/discord-magic/loader-v1.js`) resolves.
- **Mandatory resync:** C6 verified the loader resolves the payload dir **once** at `attach()` to `~/.config/discord-magic/payload/` (live dir), and that dir currently holds the **stale P1 files** (its `glass.css` still contains the dead `guild-channels` selector). `buildBootstrap()` re-reads payload files fresh on each injection, so a plain relaunch picks up new files — but ONLY after copying them into the live dir. Write `scripts/resync.sh` (copy `payload/` + `loader-v1.js` from the repo into `~/.config/discord-magic/`, show before/after sha256 of each copied file, refuse to run from a dirty git tree unless `--force`) and **run it** — this is the one deploy step you're allowed to do (it touches only `~/.config/discord-magic/`, never `~/.config/discord/`).
- `VERIFY_W2.md` summarizing: root-cause confirmation, selector evidence (with bundle line refs), design study notes (2-5 refs), what the user will see, and the exact steps: `resync` (if needed) → relaunch Discord → look for the ◆ badge → hover a profile → `data-dm-report` contents to paste if anything is still off.
- Commit as you go; **STOP.md** at repo root with a one-line status when intentionally stopped.

## Do NOT
- Re-patch the live `core.asar` (already patched; your work is payload-level — idempotent on relaunch).
- P2 physics / P3 spatial board (stub stays).
- Any secrets, tokens, or network exfiltration (local only).
