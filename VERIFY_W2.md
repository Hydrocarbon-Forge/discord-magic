# VERIFY_W2 — live-diagnosis + selector fix + Liquid Glass redesign

Date: 2026-10-14. Scope: SPEC_W2.md exactly (no P2/P3, no live asar re-patch).
Live `core.asar` sha before and after this run:
`5652dea2ad04148636672793539d2f9335c3aaa360e2a5a3938f0db35fb0e8ab`
(unchanged — payload-level work only; matches the SPEC_W2 recorded patched sha).

## 1. Root-cause confirmation (bundle evidence, build 637268)

C6's diagnosis confirmed and refined against
`/home/bsmt-pc/.hermes/cache/scratch/opencode/discord-recon/`:

**Dead selectors (P1) — CONFIRMED.** The strings `guild-channels`,
`chat-messages`, and `"members"` (as a list id) do not exist anywhere in
`client/web.94f77ed563542b5d.js` or any other chunk; `aria-label="Channels"`,
`aria-label="Members"`, and `role="log"` are likewise absent as DOM hooks
(`"Channels"`/`"Members"` occur only as i18n locale values in
`client/1804622ef5351ca2.js`). P1's three surface rules therefore matched
nothing live, exactly as observed (no visible difference).

**Real list system (from the bundle).** Module `602034` in
`client/web.94f77ed563542b5d.js`:
`let i="data-list-item-id",r="data-list-id";function a(e,t){return`${e}___${t}`}`
— the ONLY `"___"` composite in the client. Module `837381` (`rm` hook)
renders rows as `{role:"listitem",[l.eM]:(0,l.t$)(i,e),…}` and containers as
`{role:"list",…,[l.KE]:e,…}`. So:
- `data-list-id` = the RAW runtime scope (navigator/list id),
- `data-list-item-id` = `<scope>___<item>`,
- rows additionally carry `role="listitem"`, containers `role="list"`.

Verified scope literals: `id:"channels"` (chunk `9e02a872fdc90ab7.js`,
`useNavigator({id:"channels",…})`), `"guildsnav"` (`(0,C.A)("guildsnav")`, web
bundle), `id:"people"` / `id:"people-list"` (web bundle). Menu `navId`s
(`friend-row`, `channel-autocomplete`, …) use a different system.

**Correction to SPEC_W2 §B's example:** because `data-list-id` carries the
raw scope WITHOUT any `___` suffix, a pattern like
`[data-list-id$="___channels"]` can never match — the `___` composite exists
only in item ids (whose item halves are snowflakes). The correct
build-agnostic rule, implemented here, is **presence-based**: surfaces
`[data-list-id]` / `[role="list"]`, rows `[data-list-item-id]` /
`[role="listitem"]`, with per-selector match counts exported in the live
report so any over/under-match is visible without DevTools spelunking.

**Layers & popout cards (from the bundle).**
- `positionLayer__31a96` — chunk `325522` (css `{pointer-events:none;z-index:0}`
  + js style map); `positionLayerDefaultAlign*__08434`,
  `positionContainer__08434` — chunk `678906` (emoji drawer/nav; same primitive).
- `positionedLayer__31fc2` — chunk `405714` (css + js style-map entry
  `O2:"positionedLayer__31fc2"`, overlay/sticker context).
- `popoutLayer` — prop in select components (`f90510a2`, `c0924ec0`; custom
  selects, NOT profile popouts — covered anyway as a third host spelling).
- Cards: `profilePopout__1add6` (`398929` js + css `width:300px` — the real
  profile card), `accountPopout__37e49` (`487719`), `userPopout*` — zero hits
  (kept as an INFERRED fallback from the naming convention).
- Which layer hosts the hover UserPopout: chunk `951a0b72` renders popouts via
  a `positionLayerClassName` prop, i.e. through the `positionLayer` primitive;
  the exact hover-vs-modal host is left to runtime evidence — the report's
  `layersFound` field names the classes actually seen live. Foil covers all
  three host spellings PLUS card-direct mounts (profile-modal path).

## 2. What changed (repo)

- `payload/mod.js` (v `w2`): presence-based glass/row selectors; foil wraps
  CARDS via layer hosts + card-direct (never the layer container);
  `buildReport()` → `#discord-magic-ready[data-dm-report]` JSON
  (`v/ts/ready/surfacesMatched/rowsMatched/layersFound/cssInstalled/storeHandles/errors`);
  `window.__DM.report()` (fresh counts every call); `console.log("[discord-magic]", report)`
  on injection AND on re-injection (loader already-branch refreshes + logs);
  proof-of-life badge `#dm-proof-badge` (draggable, transform-only,
  double-click hides → `localStorage dm-badge-hidden=1`).
- `loader/loader-v1.js`: re-injection path calls `__DM.report()` + logs it.
- `payload/css/glass.css` + `foil.css`: Liquid Glass rework (see §3).
- `test/fixture.html`: REAL shapes — `role=list/data-list-id="channels" |
  "guildsnav" | "people-list"` + `role=listitem/data-list-item-id="<scope>___<id>"`,
  real layer/card classes (`positionLayer__31a96`, `positionedLayer__31fc2`,
  `profilePopout__1add6`), plus an unknown-scope fallback probe.
- `test/run_fixture_test.js`: pinned to repo payload via `DISCORD_MAGIC_DIR`
  (the loader otherwise prefers the live dir — this bit us once, now locked);
  asserts report JSON fields, both console logs, 4 surfaces / 7 rows, 2 foil
  stages, badge hide+persist, live report refresh. **40/40 PASS**
  (`P1-FIXTURE: ALL PASS` — runner name kept for `npm run test:p1` compat).
- `scripts/resync.sh`: deploys `loader-v1.js` + `payload/` into
  `~/.config/discord-magic/` (ONLY there — never `~/.config/discord/`),
  before/after sha256 per file, refuses dirty tree unless `--force`,
  `node --check`s deployed JS. **Run this wave:** 4 files updated
  (loader, mod, glass, foil); stores/physics unchanged. Dead
  `guild-channels` selector confirmed gone from the live `glass.css`.

## 3. Design study — macOS Liquid Glass (WWDC25 language)

Note: web search was unavailable in this session (both queries cancelled), so
no external URLs are cited; the study is grounded in the WWDC25 "Liquid Glass"
language (macOS 26 Tahoe): heavy frosted materials over content, specular
top-edge highlights, curved refractive edges, layered depth via stacked
translucency, tinted (never flat-white) frosts, generous radii, light that
bends at element edges. Mapping to our two stylesheets:
- Surfaces/rows (`glass.css`): `blur(22px) saturate(180%)` frost + cool blue
  tint gradient, baked-in top specular band (background gradient, no extra
  elements), `inset 0 1px 0 rgba(255,255,255,.55)` rim + inner depth shadows,
  outer refraction halo (`0 12px 48px` blue glow), 18px/12px radii, denser
  jelly squash `scale(.965,.945)` on a glassy `cubic-bezier(.3,1.35,.4,1)`.
- Foil cards (`foil.css`): stronger 7-stop conic sweep at 280% size,
  `color-dodge` at 0.5 opacity (screenshot-tuned: 0.65 buried card text),
  ambient rotation via `@property --dm-foil-angle` keyframes, conic rim glow
  masked to a 2px ring that shifts with tilt, deeper etched-metal name stack.
- Proof-of-life: `◆ liquid` frosted chip, bottom-right, draggable.
- Hard rules kept: class/attribute-only writes, no React restructuring,
  paint-only properties, `prefers-reduced-motion` disables jelly/tilt/sheen
  motion (static frost remains).

## 4. Evidence this run

- `npm run test:p1` → 40/40 PASS (updated fixture, tightened assertions).
- `test/evidence/fixture.png` (Chromium headless 1280×800, real payload
  executed): glass rows/surfaces, both foil cards, `◆ liquid` badge visible.
- Copy-check vs live: extracted live `core.asar` to temp (read-only) — anchor
  1×, marker `discord-magic-loader-v1` 1×, sidecar
  `~/.config/discord-magic/loader-v1.js` `require`-resolves via node.
- Resync deployed + verified (§2). Live `core.asar` untouched (sha above).

## 5. What the user will see + next steps

1. (Done) `scripts/resync.sh` deployed W2 payload to `~/.config/discord-magic/`.
2. **Relaunch Discord** (default profile). `buildBootstrap()` re-reads the new
   files on injection — no re-patch needed.
3. Look bottom-right for the **`◆ liquid` chip** (drag it; double-click hides).
4. Channel/member/people lists should show frosted glass chips; hover any
   profile → 3D tilt + shifting holographic sheen + etched name.
5. If anything is still off, paste back: the DevTools
   `console.log("[discord-magic]", …)` line, OR the marker attribute:
   inspect `#discord-magic-ready` → `data-dm-report` JSON, OR run
   `window.__DM.report()` in DevTools. `layersFound: []` + `rowsMatched: 0`
   would mean injection ran but the DOM shape differs (send the JSON).
6. Human-gated remainder: live visual confirmation + (optional)
   `restore.sh --live-ok` smoke test. No P2/P3.
