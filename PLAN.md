# PLAN — discord-magic implementation plan (post-P0)

Follows `recon/RECON.md` (build 637268, desktop 1.0.161 stable). P0 recon is done; **no
implementation in this run** (per directive).

## 1. Architecture & injection method (chosen)

**Chosen: sidecar loader via a minimal, reversible `core.asar` main-process patch.**

- Patch `~/.config/discord/app-1.0.161/modules/discord_desktop_core-1/discord_desktop_core/core.asar`
  (`bundle.js`, one hook at window creation) to `require()` a versioned sidecar directory **outside**
  any asar, e.g. `~/.config/discord-magic/loader-v1.js`. The sidecar hooks
  `mainWindow.webContents` (`did-finish-load` + `did-navigate-in-page` guard) and calls
  `webContents.executeJavaScript(<bootstrap>)`, which runs in the **main world** with full access to
  `window.webpackChunkdiscord_app`, the module cache, `MediaEngineStore`/`VoiceStateStore`, and the
  DOM. All feature code ships in the sidecar + page-world payload — the asar patch stays tiny and
  stable across Discord updates.
- **Why not the alternatives** (see RECON §5): `--load-extension` is ignored by stock Electron;
  `chromiumSwitches` allowlist is GPU-only; `DISCORD_WEBAPP_ENDPOINT` breaks TLS/session;
  `app.asar` is the wrong layer; `session.loadExtension` from the patch is kept as fallback if
  `executeJavaScript` timing proves flaky (it won't — `did-finish-load` + a `document.readyState`
  poll + `MutationObserver` triple-guard).
- **Update-tolerance & reversibility (SPEC hard rule 2):** before first patch,
  `backups/app.asar.<ts>`-style **byte-for-byte backup of `core.asar`** + a one-command
  `restore.sh`; a `apply.sh` re-applies the one-hook patch after Discord updates (patch is a single
  anchored string replace, verified by checksum before/after). No tokens/keys ever touched
  (SPEC hard rule 4).

## 2. Feature designs (adjusted for recon findings)

### F1 — Liquid glass + jelly (P1)

- Pure CSS/DOM overlay layer: a `<style>` payload + `MutationObserver`-attached classes on stable
  surfaces (channel list, chat, member list via `[data-list-item-id]`, resolved hashed classes via
  style-map scan). `backdrop-filter: blur/saturate`, gradient borders, squash-on-press via
  `transform: scale()` with `transition-timing-function` (spring curves in P2).
- No React interference: style only; never restructure React-owned subtrees.

### F2 — Holographic foil 3D-tilt profile cards (P1)

- Observe `.positionedLayer__*` for popout mount → wrap the popout root in a perspective stage div
  (sibling overlay, original node untouched) → `mousemove` tilt (`rotateX/rotateY` ≤ ~12°) +
  iridescent foil layer (`conic-gradient` + `mix-blend-mode: color-dodge`, position driven by CSS
  vars) + "metal etching" text (`background-clip: text` + bevel `text-shadow` stack).
- Verified hook points: `positionLayer__*` containers, `[data-list-item-id]` rows as secondary
  targets (hover preview), style-map value scan for `profilePopout`-family classes.

### F3 — Spring-physics animation system (P2)

- One rAF loop, semi-implicit Euler springs (stiffness/damping per surface preset:
  hover/press/settle). Drives CSS vars (`--tilt-x`, `--squash`, …) consumed by F1/F2 — physics never
  writes layout properties directly (transform/opacity only).

### F4 — Spatial voice board (P3, highest risk — now de-risked)

- **Correction to SPEC's assumption:** do NOT route audio through WebAudio (`PannerNode`/
  `StereoPannerNode`+`GainNode`). Desktop voice never flows through DOM `MediaStream`s (RECON §3);
  instead drive the **native per-user controls from in-page JS**:
  - Stereo board (default): map board X → equal-power gains →
    `MediaEngineStore.setLocalPan(userId, left, right)` (0–1 linear per channel). Persisted in
    `localPans`, survives reconnects; read back via `getLocalPan`.
  - 3D/room mode (stretch): `setUserPosition(userId, {x,y,z})` through the existing spatial-mixer
    path (Steam Audio HRTF/ambisonics in `discord_voice.node`); test precedence against the built-in
    Spatial Audio toggle and Activities spatial claims.
- Board UI: standalone draggable 2D canvas (own fixed-position root, `createRoot` optional — plain
  DOM is fine), participants from `VoiceStateStore.getVoiceStatesForChannel(channelId)`, live
  speaking state from the `SPEAKING` action (with dB). Drag icon → throttle position→pan updates
  (~20 Hz, matching the native `max_updates_per_second: 20`).
- Fallback if native calls ever no-op (browser/overlay): detect via `supports(SPATIAL_AUDIO)` and
  connection type; in fallback, board becomes observe-only with an explicit notice. (Desktop stable
  is the supported target.)

## 3. File layout (target)

```
loader/loader-v1.js        # Node side: required by the core.asar one-hook patch; injects payload
payload/mod.js             # page main-world bootstrap: webpack hook, store access, observers
payload/css/glass.css      # liquid glass + jelly
payload/css/foil.css       # tilt-foil card styles
payload/js/physics.js      # spring system (P2)
payload/js/spatial.js      # voice board + native pan/position mapping (P3)
payload/js/stores.js       # webpack cache scan, style-map resolver, store handles
scripts/apply.sh           # backup + patch core.asar (idempotent, checksum-verified)
scripts/restore.sh         # one-command restore from backup
backups/                   # (git-ignored) byte-for-byte core.asar backups
recon/RECON.md             # P0 findings
PLAN.md                    # this file
README.md                  # (P4) build/apply/unapply/launch/controls
```

## 4. Phased milestones

- **P1 — Loader scaffold + visual family.** `apply.sh`/`restore.sh` + sidecar; `executeJavaScript`
  bootstrap verified by marker DOM node; liquid-glass CSS on 3+ surfaces; tilt-foil cards on profile
  popouts. No audio work.
- **P2 — Physics.** Spring system + presets; applied to glass press/squash and card settle.
- **P3 — Spatial voice board.** Participant enumeration → draggable board → `setLocalPan` mapping
  (audible L/R verified per user); stretch: `setUserPosition` 3D mode; fallback behavior.
- **P4 — Polish/packaging.** Settings UI (board toggle, glass intensity, foil on/off), restore
  tooling hardening, update re-apply flow, `README.md` (build/apply/unapply/launch/controls).

## 5. Risks

1. **Web-build drift** (live `/app`, hashes rotate): mitigate with hash-agnostic hooks (attribute
   selectors, style-map value scans); P4 adds a self-test that logs unresolved hooks.
2. **Spatial-path precedence** (`setUserPosition` vs built-in Spatial Audio toggle vs Activities
   claims): P3 verification matrix below; stereo `setLocalPan` has no such conflict (independent
   per-user gains).
3. **React Compiler memoization**: we never mutate React-owned nodes, only wrap/observe — low risk.
4. **Electron updates changing `core.asar` layout**: one-hook patch + checksum guard makes failures
   loud and restorable, never silent.
5. **No secrets exposure**: loader/payload handle no auth material; settings.json edits are
   local-only and documented.

## 6. Verification plan (how each feature is proven in the running client)

- **Loader:** launch Discord normally (default profile) after `apply.sh`; marker node
  `#discord-magic-ready` present; DevTools (via the `DANGEROUS_ENABLE_DEVTOOLS…` settings flag)
  shows bootstrap console lines; `restore.sh` returns client to stock (checksum match).
- **Glass/jelly:** screenshot comparison of member list/channel/chat with/without; press-squash
  visible at 60 fps; no console errors; survives channel navigation (observer re-attach).
- **Tilt-foil:** open any profile popout → 3D tilt follows cursor, foil sheen moves, etched text
  legible; modal (`View Profile`) also covered if same layer path.
- **Physics:** spring overshoot/settle measurable (logged amplitude envelope); hover/press/settle
  presets distinguishable.
- **Spatial board:** join voice with ≥2 other clients (or one + loopback): drag a user hard-left →
  audible left-only for that user, others unchanged; read back `getLocalPan` matches; positions
  persist across reconnect; speaking indicators track `SPEAKING` dB; 3D mode: front/back/left/right
  placement audible (document toggle interaction).
