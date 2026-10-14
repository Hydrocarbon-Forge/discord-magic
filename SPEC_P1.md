# discord-magic — P1 directive (implementation wave 1)

**Model:** `opencode/muse-spark-1.3-contributor-free#xhigh` · **Repo:** `~/HydrocarbonForge/Projects/discord-magic`
Read `SPEC.md` (env facts + hard rules), `recon/RECON.md`, and `PLAN.md` first.

## Scope this run: build the full loader + the visual family (F1 + F2)

Implement the file layout from `PLAN.md §3`:

- `loader/loader-v1.js` — Node sidecar `require`d by the one-hook `core.asar` patch. On `did-finish-load` (with `did-navigate-in-page` guard + `document.readyState` poll + MutationObserver re-attach), `webContents.executeJavaScript(<bootstrap>)` into the main world. Idempotent: safe if re-run.
- `payload/mod.js` — page main-world bootstrap: `window.webpackChunkdiscord_app` hook → module-cache scan → expose store handles (`MediaEngineStore`, `VoiceStateStore`) on a global (e.g. `window.__DM`) for later waves. For P1, at minimum resolve the style-map and attach the visual observers.
- `payload/stores.js` — webpack cache scan + style-map value-scan resolver (hashed `name__hash` class resolution, hash-agnostic).
- `payload/css/glass.css` — **F1 liquid glass + jelly**: `backdrop-filter` blur/saturate, gradient borders, soft glow; applied to ≥3 stable surfaces (channel list, chat/message list, member list via `[data-list-item-id]`, resolved hashed classes). Jelly: `transform: scale()` squash on `:active`/press with a spring-ish `cubic-bezier`. **CSS only — never restructure React-owned subtrees.**
- `payload/css/foil.css` — **F2 holographic foil 3D-tilt cards**: wrap `.positionedLayer__*` / `positionLayer__*` popout roots in a perspective stage (sibling overlay, original untouched); `mousemove` → `rotateX/rotateY` (≤~12°) via CSS vars; iridescent foil layer (`conic-gradient` + `mix-blend-mode: color-dodge`, position driven by CSS vars); "metal etching" text (`background-clip:text` + bevel `text-shadow` stack).
- `payload/physics.js` — **stub only** (P2 builds the real spring system). Provide a no-op `installSpring()` placeholder so F1/F2 can reference it later without breaking P1.
- `scripts/apply.sh` — **byte-for-byte backup** of the live `core.asar` → `backups/core.asar.<ts>` (git-ignored), then the one-hook string-replace patch (single anchored replace, checksum-verified before/after, idempotent — safe to re-run). 
- `scripts/restore.sh` — one-command revert from the latest backup; verify checksum match on restore.

## SAFETY GATE — do NOT touch the live install this run

Per `SPEC.md` hard rule 2: **do NOT run `apply.sh` against the live** `~/.config/discord/app-1.0.161/modules/discord_desktop_core-1/discord_desktop_core/core.asar`. The live-apply + Discord relaunch is a human-gated step C6 will run with the user. Instead **prove every risky mechanic on a copy**:

1. **Copy** the live `core.asar` into `scratch/` (or a test dir). Run the *exact* same patch logic `apply.sh` uses against the copy. Confirm: (a) the anchor string appears **exactly once** in the pre-patch bundle, (b) post-patch it appears exactly once with the sidecar `require` inserted, (c) the packed copy re-extracts cleanly and the anchor+require are both present.
2. **Round-trip the backup/restore** on the copy: back up → verify byte-for-byte match → "restore" → verify checksum equals the original. Prove it's lossless.
3. **Prove the visual logic** without a live patched client: build a small test fixture (node + jsdom, or a minimal Playwright page with a representative DOM: a `[data-list-item-id]` list + a `.positionedLayer__x` popout container) and assert: glass classes attach to ≥3 surfaces, the foil stage wraps the popout root, `mousemove` updates the tilt CSS vars, and the foil conic-gradient `background-position` tracks the cursor. Capture a screenshot of the fixture as evidence.
4. Keep `apply.sh`/`restore.sh` ready to run live, but **un-executed** against the real install.

## Deliver this run

- All files above, committed as you go (small honest commits).
- `VERIFY_P1.md` — what you proved (patch on copy, round-trip, fixture test output + screenshot path) and exactly what remains human-gated (live `apply.sh` + Discord relaunch).
- `git add -A && git commit`.
- **Sentinel:** write `STOP.md` at repo root with a one-line status: "P1 complete — loader+F1+F2 built & copy-verified; live apply pending human gate."

**Do NOT** implement P2 (physics) or P3 (spatial board) this run beyond the stub. Do NOT run anything against the live Discord install.
