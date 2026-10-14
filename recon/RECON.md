# RECON — Discord desktop 1.0.161 (stable, linux-x64) targeted recon

Date: 2026-10-14. Scope: P0 only — no code changes to Discord, no launch, read-only.
Raw working copies (outside repo): `/home/bsmt-pc/.hermes/cache/scratch/opencode/discord-recon/`
(`app-asar/`, `core-asar/`, `client/` = 1977 downloaded web assets, `app-shell.html`).

Evidence labels: **[REA]** = REA MCP `analyze_javascript_application` (static, never executed);
**[shell]** = direct inspection (`asar`, `grep`, `strings`, `curl`, Chromium cache parsing).

## 1. Big picture: where the code lives

- `~/.config/discord/app-1.0.161/resources/app.asar` (3.5 MB) is **only the main-process
  bootstrapper** (Rspack bundle `bundle.js` + `splash/`). **[shell]** `asar list` shows just
  `/bundle.js`, `/package.json`, `/splash/*`. Electron 42.7.1 (per its `package.json` devDeps).
- Real main-process logic lives in
  `modules/discord_desktop_core-1/discord_desktop_core/core.asar` (`bundle.js` + 1.1 MB
  `mainScreenPreload.js`, loaded via `index.js` → `require('./core.asar')`). **[shell]**
- The **renderer (web client) is NOT shipped locally** — the main window loads it live from
  `URL_TO_LOAD = WEBAPP_ENDPOINT + WEBAPP_PATH` = **`https://discord.com/app`** (stable).
  Overridable via `DISCORD_WEBAPP_ENDPOINT` env (not useful — would break TLS/session; rejected).
  **[shell]** `core-asar/bundle.js` (`loadMainPage`, `WEBAPP_PATHS={APP:"/app",...}`).
- The exact build the desktop client runs was recovered two ways (same build):
  - **[shell]** `curl https://discord.com/app` on 2026-10-14 → `GLOBAL_ENV.BUILD_NUMBER 637268`,
    `VERSION_HASH a935e483c18dcf082c62ce19bc9e3560fce10581`, `PUBLIC_PATH /assets/`.
  - **[shell]** The desktop client's own Chromium HTTP cache (`~/.config/discord/Cache/Cache_Data/`,
    written 2026-10-14 19:26–19:28) contains the same chunk names (e.g. `556707.bb1a25f3c212ce8f.js`),
    including the main bundle `web.94f77ed563542b5d.js` (12.3 MB raw, downloaded for analysis).
- **[REA]** `analyze_javascript_application` on `app.asar`
  (`ev_985ca188…`, root sha256 `f61e9bf3…`, 975 modules, 0 parse failures) and on `core.asar`
  (`ev_5fcc3b3d…`, root sha256 `c3ef8e35…`, 487 modules, `context_bridge_apis: 1`, partial coverage —
  budgets, not errors). Both static-only; findings below cross-checked with shell greps.

## 2. Renderer framework & bundling **[shell]**

- **React 18+** with the automatic `jsx`/`jsxs` runtime (`(0,r.jsx)`, `(0,r.jsxs)`, `r.Fragment`
  everywhere), `createRoot`, `useTransition`/`useDeferredValue`/`useOptimistic`/
  `useSyncExternalStore` present, and **React Compiler** memoization markers in `web.*.js`.
  Implication: components are auto-memoized — mutate the DOM *around* React (overlays, wrappers),
  never fight React-owned subtrees.
- **Webpack code-splitting**, global `window.webpackChunkdiscord_app` in every chunk (verified in all
  1362 JS files). Standard module-smuggling hook works:
  `webpackChunkdiscord_app.push([[Symbol()], {}, r => <capture require>])` → scan
  `require.c` (module cache). No public sourcemaps (`.map` → 404 page).
- **CSS Modules**, current naming scheme **`origName__hash5or6hex`** (double underscore, e.g.
  `accountPopout__37e49`, `positionLayer__31fc2`) plus some legacy single-underscore names.
  Style maps ship as tiny JS modules: `_.exports={minKey:"origName__hash",…}` (e.g. chunk
  `398929.40d62cce0be59df7.js`, 92 mappings). Minified keys, **readable values** → at runtime,
  resolve hashed classes by scanning module exports for value patterns, never hardcode hashes.
- **CSP** (response header on `https://discord.com/app`): `script-src 'self' 'unsafe-eval'
  'unsafe-inline' …` and `style-src 'self' 'unsafe-inline' …`. **Inline `<script>` and inline styles
  are allowed** — DOM-injected scripts/styles will run (still prefer `executeJavaScript`-equivalent
  main-world eval for reliability; see §5).

## 3. Voice audio pipeline — TOP PRIORITY QUESTION **[shell; REA corroborates artifact identity]**

**Verdict: on desktop there are NO per-participant `MediaStreamTrack`s in the renderer DOM.
All voice capture/render/mixing happens in the native `discord_voice` module; the renderer drives
it per-user through a JS bridge. Per-participant spatial panning is feasible — natively, not via
WebAudio `PannerNode`.**

Evidence chain:

1. `modules/discord_voice-1/discord_voice/index.js` (471 lines) detects the Electron renderer
   (`globalThis.window?.DiscordNative`, `isElectronRenderer`) and `require('./discord_voice.node')`
   — a 123 MB native addon (Rust + C++ symbols) — directly into the renderer/preload context.
   It wraps `new VoiceEngine.VoiceConnection(userId, connectionOptions, onConnect)` with a
   per-connection JS facade exposing **per-user** controls (lines ~141–147):
   - `setLocalVolume(userId, volume)` — per-participant gain (client schema: 0–200, matches the
     in-app per-user volume slider).
   - **`setLocalPan(userId, left, right)`** — per-participant stereo pan
     (client schema: `left/right: number().min(0).max(1)`).
   - `setLocalMute(userId, mute)`, `setUserPosition(userId, position)`, `mergeUsers/destroyUser`
     (per-SSRC user lifecycle), `setAttenuation`, `setMinimumOutputDelay`, Krisp wiring.
2. `strings` on `discord_voice.node` shows a full native spatial stack:
   `discord::media::SpatialMixer`, `add_spatial_candidate`, and **Steam Audio (`ipl::`) effects**:
   `PanningEffect`, `AmbisonicsPanningEffect`, `BinauralEffect`, `HRTFDatabase`, `SOFAHRTFMap`.
   The engine mixes per-source audio itself and outputs to the OS device (own ADM:
   `offloadAdmControls`, `standard`/`experimental` audio subsystems).
3. The shipped web client (`client/web.94f77ed563542b5d.js`, same code the desktop loads) confirms
   the desktop/native path and a browser/WebRTC fallback side by side:
   - Desktop: `DiscordNative.nativeModules.requireModule("discord_voice")` (`ensureModule` +
     whitelist `/^discord_[a-z0-9_-]+$/`), `getVoiceEngine()`, per-connection
     `conn.setLocalPan / setLocalVolume / setUserPosition`.
   - Browser fallback class uses `new RTCPeerConnection(...)` + `ontrack` + loopback `pc1/pc2` pairs,
     and stubs `setLocalPan(e,t,n){}` / `setUserPosition(e,t){}` as **no-ops** — i.e. pan/position
     only exist on the native desktop connection.
   - `MediaEngineStore.setLocalPan(userId,left,right)` (default context `DEFAULT`) dispatches
     `AUDIO_SET_LOCAL_PAN` → persisted in `localPans[userId]` → `eachConnection(c =>
     c.setLocalPan(...))`, re-applied on `(re)connect` and on `mergeUsers`/user-create. Same pattern
     for volume/mute. State readable via `getLocalPan/getLocalVolume/isLocalMute`.
4. **A first-party spatial system already exists and exercises this path.** `setUserPosition(userId,
   {x,y,z})` (default/reset `wk={x:0,y:0,z:-1}`) with `appliedUserIds` tracking, `max_sources: 50`,
   `max_updates_per_second: 20`; `getSpatialCapabilities()` =
   `config("VibegrationsVoiceSessionCoordinator") && supports(SPATIAL_AUDIO)`; user-facing
   "Spatial Audio" voice setting (`VOICE_SPATIAL_AUDIO_SETTING`) → `setAudioMixerOptions({isSpatial})`
   → native `setTransportOptions({audioMixerOptions})` → per-connection `setSpatialAudioEnabled`.
   This is the Activities/embedded-app spatial-voice feature — proof the native mixer honors
   per-source 3D positions at runtime.
5. Enumeration/observation stores exist in-page: `VoiceStateStore.getVoiceStatesForChannel`
   (participants, 9 refs), `SPEAKING` dispatch with voice dB, `MediaEngineStore` (`setLocalPan`,
   `getLocalVolume`, `toggleLocalMute`, `supports(SPATIAL_AUDIO)`).
6. `AudioContext` (24 refs) in-page is used for mic-test/loopback, VAD worklets
   (`worklet.8d84….js`), and settings UI — **not** for voice playout. No `createMediaStreamSource`
   in the voice playout path on desktop.

**Bottom line for P3:** skip WebAudio routing entirely. Drive `MediaEngineStore.setLocalPan` (stereo,
simple, always available) and/or the `setUserPosition` spatial path (full 3D, honors the existing
mixer; verify audibility vs. the built-in Spatial Audio toggle in P3). Both are reachable from
injected main-world JS via the webpack module cache — no native patching, no audio-graph hacks.

## 4. Profile / member / voice-user DOM structure **[shell]**

(All class hashes are build `637268`-specific examples — **resolve at runtime**, §2.)

- **User profile popout**: component keyed by `UserPopout`/`USER_POPOUT`/`mutualGuilds` fetches
  (chunks `3a2708ed…`, `41a15973…`, `9d6a86d0…`, `951a0b72…`, `9e02a872…`). Popouts render inside
  floating layers: `.positionLayer__08434` / `.positionLayer__31a96` (+ `positionLayerDefaultAlign*`),
  container `.positionedLayer__31fc2`. Tilt-foil hook = the popout root inside the visible
  `positionLayer` (observe via `MutationObserver` on `.positionedLayer__*`, then 3D-transform the
  popout card node; foil = extra overlay div + `backdrop-filter`, never touching React children).
- **Member list rows**: stable hook **`[data-list-item-id="<scope>___<id>"]`** — format
  `` `${scope}___${id}` `` with in-client selector builder `` `[${attr}="${e}"]` `` (web bundle
  module `34(…)`). Rows use `role="option"`, `aria-selected`, avatar + username subtrees.
  Member-list chunk: `516949.1d13cd5192641fc9.js`; also `66966b507316eb46.js`.
- **Voice-channel user rows**: rendered by the `VoiceUsers` component (`voiceStates` prop,
  `renderVoiceUsers()` in channel components); voice-user code across `249727.…`, `459397.…`,
  `467847.…`, `5609a16f…`, `58353.…`, `593586.…`, `78f317…`, `880186.…`, `9d6a86d0…`, `9e02a872…`.
  Same `data-list-item-id` row pattern as member list. Speaking state available from the
  `SPEAKING` store action (with voice dB) — no need to scrape the green ring.
- **General strategy (hash-proof):** (1) prefer stable attributes (`data-list-item-id`, `role`,
  `aria-label`) over classes; (2) resolve hashed classes at runtime by scanning
  `webpackChunkdiscord_app` module cache for style-map exports whose *values* match
  `/^(profilePopout|… )__[0-9a-f]+$/`; (3) `MutationObserver` for popout/popover mount.

## 5. Injection points **[shell]** (chosen method decided in `PLAN.md`)

Main window: `nodeIntegration:false, contextIsolation:true, sandbox:false`,
`preload: mainScreenPreload.js`, which exposes **`window.DiscordNative`** (`contextBridge.
exposeInMainWorld("DiscordNative", …)`; **[REA]** core.asar confirms 1 context-bridge API).
`DiscordNative` surface: `nativeModules` (whitelisted `requireModule`: `discord_voice`,
`discord_utils`, … via a Node `Module` shim with main-supplied paths), `process`, `os`, `app`,
`clipboard`, `ipc`, `window`, `desktopCapture`, `fileManager`, `settings`, `safeStorage`,
`webAuthn`, … — **no direct voice API** (voice goes through `nativeModules.requireModule`
from the page side instead).

Candidates (ranked; verdict in PLAN.md):

1. **Patch `core.asar` main bundle to load a sidecar** (preferred): `index.js` →
   `require('./core.asar')`; patch once to `require` an external dir (e.g.
   `~/.config/discord-magic/loader.js`) that hooks `mainWindow.webContents` (`did-finish-load` /
   `did-navigate`) → `executeJavaScript` (main world, CSP-safe — and inline scripts are allowed
   anyway) to bootstrap the mod. Precedent in-bundle: `insertCSS("body { -webkit-app-region: drag;
   }")` on `did-finish-load`, `executeJavaScript("document.getElementById('__document_pip_trigger')
   ?.click()")` for document-PiP. Reversible via byte-for-byte backup + re-apply script
   (mandatory per SPEC hard rule 2; backups excluded from git via `backups/`).
2. **`session.defaultSession.loadExtension()` from the same main-process patch**: loads an unpacked
   extension whose content scripts run on `https://discord.com/*`. More moving parts (MV
   compatibility in Electron 42, isolated-world bridging for store access) — fallback option.
3. **Rejected**: `--load-extension` CLI flag (nothing strips it, but stock Electron ignores it —
   extensions need the session API); `chromiumSwitches` in `settings.json` (allowlist is GPU-only:
   `disable_accelerated_h264_*`, `disable_d3d11*`, `force_*_gpu`, … — no debugging/extension flags);
   `DISCORD_WEBAPP_ENDPOINT` override (breaks TLS/session model); `app.asar` patching (wrong layer —
   splash/boot only).
4. **DevTools for development** (no code change): set
   `DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING: true` in
   `~/.config/discord/settings.json` → `devTools:true` + app menu on stable. Reversible, local-only.

## 6. Risks / unknowns (for PLAN.md)

- Web build drifts (live `/app`, no pin): chunk names/hashes change per deploy; all hooks must be
  hash-agnostic (§2, §4). Analyzed build: shell 637268 / `web.94f77ed5…` (2026-10-14).
- `setUserPosition` spatial path interacts with the built-in Spatial Audio toggle and Activities
  sessions (`syncSpatialHolder`, spatial claim/holder); P3 must test precedence/audibility.
- `setLocalPan` gains are linear 0–1 per channel; equal-power crossfade law must be applied in our
  board→pan mapping.
- Electron 42 + `sandbox:false` preload: our main-process patch runs with full Node — keep the
  loader minimal and audited.
- **[REA]** coverage was partial (result budgets); treated as corroboration, not sole basis.
