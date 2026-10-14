# discord-magic — Discord desktop client-side mods

**Owner:** Nathan (Hydrocarbon Forge) · **Agent:** opencode (muse-spark-1.3-contributor-free #xhigh) · **C6 verifies.**

Client-side modifications for the **Discord desktop (Electron)** client that add:
1. **Liquid glass + jelly + physics UI** — glassmorphism surfaces, squash/jelly deformation, spring-physics animations.
2. **Spatial voice board** — a draggable 2D canvas of voice participants; drag icons and hear each person's audio panned/positioned to match (like Telegram/Slack spatial voice).
3. **Holographic foil 3D-tilt profile cards** — profile cards that tilt in 3D on mouse move, with an iridescent "foil" layer and a "metal etching" (engraved/bevel) text treatment.

---

## Verified environment (from C6 — trust these, re-verify only if they fail)

- **Discord stable 1.0.161**, unpacked Electron app.
  - Launcher wrapper: `/usr/bin/discord` (downloads/updates into `~/.config/discord/`).
  - App dir: `~/.config/discord/app-1.0.161/`
    - Electron binary: `~/.config/discord/app-1.0.161/Discord`
    - Bundle: `~/.config/discord/app-1.0.161/resources/app.asar` ← **the main artifact to analyze**
    - Native modules: `~/.config/discord/app-1.0.161/modules/discord_voice-1` (WebRTC/Krisp voice), `discord_rpc-1`, `discord_spellcheck-1`, `discord_utils-1`, etc.
  - Runtime data: `~/.config/discord/` (Cache, Local Storage, Cookies, `app-1.0.161/`, `settings.json`).
  - Discord is **currently NOT running** (safe to inspect; do not launch it mid-recon unless needed, and if you do, launch it with the default profile, never a fresh/second profile).
- **Node v26.7.0.** **opencode v2.0.21** at `~/.opencode/bin/opencode`. Model: `opencode/muse-spark-1.3-contributor-free` at `#xhigh` (max thinking). Always pass `--model opencode/muse-spark-1.3-contributor-free#xhigh`.
- **REA CLI v6.5.0** at `/usr/local/bin/rea`. REA MCP is registered for opencode (`~/.config/opencode/opencode.json`). **If REA MCP tools are not visible in your session, do not stall** — call `rea` directly from your shell (e.g. `rea analyze-javascript-application`, `rea analyze-web-bundle`, `rea capture-electron-scenario`). If tools are absent/blocked, read the REA skill's `references/connection-and-recovery.md` before looping on setup.
- Playwright browsers exist in `~/.cache/ms-playwright` (ffmpeg, firefox).
- Git identity is already set in this repo: `Hydrocarbon Forge` / `forge@hydrocarbon.local`. Repo already `git init`-ed with an initial commit.

---

## Hard rules

1. **Git:** commit as you go (not just at the end). Small, honest commits per logical step.
2. **Never break the real Discord install.** Before touching `app.asar`, back it up byte-for-byte to `backups/app.asar.<timestamp>` and write a one-command **restore** script. Any method that modifies `app.asar` must be fully reversible and re-applicable after Discord updates.
3. **Prefer non-destructive, update-tolerant injection** over hard-patching `app.asar` if feasible — e.g. a **Chrome/Chromium extension loaded via `--load-extension`** (Discord desktop is Chromium and accepts unpacked extensions at launch), or a bootstrapped user script. Evaluate trade-offs in `PLAN.md` and pick one.
4. **Safety:** this is a local visual/audio mod. **Never** read, transmit, or include Discord auth tokens, keys, or the bot token anywhere. Never exfiltrate. Do not send any Discord secrets in reports.
5. **Reverse engineering:** use REA (or plain shell/`asar` tools) to understand the renderer — but be **targeted**, not exhaustive ("you may not need much at all"). Label which evidence came from REA vs. plain shell tools.

---

## Deliverables

- `recon/RECON.md` — targeted Discord structure findings:
  - Renderer framework & bundling (React? class-name conventions like `notranslate`, `hashAnchor_*`, obfuscated component names).
  - **Voice audio pipeline (TOP PRIORITY QUESTION):** does the renderer receive **per-participant** `MediaStreamTrack`s (via `RTCPeerConnection`/`ontrack`), or a single **mixed** stream? Where is audio mixed — web layer or the native `discord_voice-1` module? This determines whether per-participant spatial panning is feasible in the renderer.
  - Profile / member hover / voice-user **DOM structure** (selectors, class names) to hook the tilt-foil cards onto.
  - Concrete **injection points** for the chosen method.
- `PLAN.md` — architecture; chosen injection method + why; feature-by-feature technical design (glass/jelly/physics, spatial audio routing via `PannerNode`/`StereoPannerNode`+`GainNode`, tilt-foil cards); file layout; **phased milestones**; risks; verification plan (how to confirm each feature actually works in the running client).
- Working implementation + a **load mechanism** that reliably gets our JS/CSS into the renderer.
- `README.md` — how to build, apply, **unapply/restore**, and **launch Discord with the mod**; controls/settings.
- Clean commit history.

---

## Suggested phases

- **P0 — Recon + plan (THIS RUN).** Produce `recon/RECON.md` + `PLAN.md`. **Do NOT implement yet.** End with a short summary of key findings + your chosen approach.
- **P1 — Loader scaffold + visual family:** the injection mechanism + **liquid glass** surfaces + **jelly** deformation + **holographic foil 3D-tilt profile cards**. (Highest visual value, most self-contained, works without audio.)
- **P2 — Physics:** spring-physics animation system (hover/press/settle) applied across the glass surfaces.
- **P3 — Spatial voice board (HIGHEST RISK):** 2D draggable board + per-participant WebRTC audio routing to panner nodes. Only build after P0 confirms the audio pipeline is per-participant in the renderer; if it's mixed/native-only, propose the best fallback (e.g. nearest-feasible approximation) and say so explicitly.
- **P4 — Polish/packaging:** settings UI, restore tooling, update-tolerance, docs.

---

## This run's directive (P0)

1. Do a **targeted recon** of the Discord Electron app using REA (preferred) and/or `asar`/shell tools. Prioritize the voice-audio pipeline question and the DOM structure for profiles/members/voice users. Keep it focused.
2. Write `recon/RECON.md` (findings, with REA-vs-shell labels).
3. Write `PLAN.md` (architecture, injection method choice, per-feature technical design, file layout, phased milestones, risks, verification plan).
4. `git add -A && git commit`.
5. Stop and give a short summary. **Do not start implementation in this run.**

**Sentinel:** when intentionally stopped, write `STOP.md` at the repo root with a one-line status.
