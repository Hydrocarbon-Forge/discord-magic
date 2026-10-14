'use strict';
// discord-magic loader v1 (P1) — main-process sidecar.
//
// Required once by the one-hook `core.asar` patch (see scripts/apply.sh).
// `attach(mainWindow)` hooks `mainWindow.webContents` and injects the page
// payload (`payload/mod.js` + stores + CSS) into the renderer main world via
// `webContents.executeJavaScript`. Idempotent: safe to call twice on the same
// window (second call is a no-op returning the marker).
//
// P1 scope only: loader + visual family (F1 glass/jelly CSS, F2 foil tilt).
// Physics (P2) ships as a stub; spatial board (P3) is not included.

const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER = 'discord-magic-loader-v1';
const PAGE_MARKER_ID = 'discord-magic-ready';
const PAYLOAD_FILES = [
  'stores.js',
  'physics.js',
  'mod.js',
];
const CSS_FILES = {
  glass: path.join('css', 'glass.css'),
  foil: path.join('css', 'foil.css'),
};

// Candidate payload roots, first hit wins. Supports:
//   - $DISCORD_MAGIC_DIR (explicit override, used by copy-verification tests)
//   - <homedir>/.config/discord-magic (live install target)
//   - <sidecar-dir>/payload and <sidecar-dir>/../payload (repo checkout layout)
function resolvePayloadDir() {
  const candidates = [];
  if (process.env.DISCORD_MAGIC_DIR) {
    candidates.push(path.join(process.env.DISCORD_MAGIC_DIR, 'payload'));
    candidates.push(process.env.DISCORD_MAGIC_DIR);
  }
  candidates.push(path.join(os.homedir(), '.config', 'discord-magic', 'payload'));
  candidates.push(path.join(os.homedir(), '.config', 'discord-magic'));
  candidates.push(path.join(__dirname, 'payload'));
  candidates.push(path.join(__dirname, '..', 'payload'));
  for (const dir of candidates) {
    try {
      if (PAYLOAD_FILES.every((f) => fs.existsSync(path.join(dir, f)))) return dir;
    } catch (_) { /* try next */ }
  }
  throw new Error(
    '[discord-magic] payload not found. Searched: ' + candidates.join(', ')
  );
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

// Build the main-world bootstrap JS string. Order matters:
//   1. seed window.__DM.css with the two stylesheets (mod.js consumes them)
//   2. stores.js (webpack scan + style-map resolver)
//   3. physics.js (P1 stub)
//   4. mod.js (observers + marker node)
function buildBootstrap(payloadDir) {
  const css = {};
  for (const [key, rel] of Object.entries(CSS_FILES)) {
    css[key] = readText(path.join(payloadDir, rel));
  }
  const src = PAYLOAD_FILES.map((f) => readText(path.join(payloadDir, f))).join('\n;\n');
  // JSON-embed everything so the bootstrap is a single executeJavaScript
  // payload. One indirect eval (global scope) of the whole concatenated
  // source — no chunk splitting, so payload files cannot break the seam.
  return (
    '(function(){\n' +
    'try{\n' +
    'if(window.__DM&&window.__DM.ready){return "discord-magic:already";}\n' +
    'window.__DM=window.__DM||{};\n' +
    'window.__DM.css=' + JSON.stringify(css) + ';\n' +
    '(0,eval)(' + JSON.stringify(src) + ');\n' +
    'return (window.__DM&&window.__DM.ready)?"discord-magic:injected":"discord-magic:mod-not-ready";\n' +
    '}catch(e){return "discord-magic:error:"+(e&&e.message||e);}\n' +
    '})()'
  );
}

// Wrap the bootstrap with a document.readyState poll so executeJavaScript
// landing before first paint still runs against a live DOM. Resolves to the
// bootstrap's return string.
function wrapWithReadyPoll(bootstrapJs) {
  return (
    '(async()=>{' +
    'let n=0;' +
    'while(document.readyState==="loading"&&n<100){await new Promise(r=>setTimeout(r,50));n++;}' +
    'return (function(){' + bootstrapJs + '})();' +
    '})()'
  );
}

function injectInto(webContents, payloadDir) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve('discord-magic:webContents-destroyed');
  }
  let bootstrap;
  try {
    // Rebuild per injection so edits to payload/ apply without a restart.
    bootstrap = buildBootstrap(payloadDir);
  } catch (e) {
    console.error('[discord-magic] buildBootstrap failed:', (e && e.message) || e);
    return Promise.resolve('discord-magic:build-failed');
  }
  return webContents
    .executeJavaScript(wrapWithReadyPoll(bootstrap), true)
    .then((r) => {
      console.log('[discord-magic] inject result:', r);
      return r;
    })
    .catch((e) => {
      console.error('[discord-magic] inject failed:', (e && e.message) || e);
      return 'discord-magic:inject-failed';
    });
}

// Attach to a BrowserWindow. Safe to call again for the same window.
function attach(mainWindow) {
  if (!mainWindow || !mainWindow.webContents) {
    throw new Error('[discord-magic] attach(mainWindow): invalid window');
  }
  if (mainWindow.__dmAttached === MARKER) return MARKER;

  const payloadDir = resolvePayloadDir();
  console.log('[discord-magic] loader v1 attached, payload:', payloadDir);

  let navDebounce = null;
  const onFinishLoad = () => {
    injectInto(mainWindow.webContents, payloadDir);
  };
  // SPA guard: Discord navigates in-page (channel switches are not full
  // loads). Re-inject (page side is idempotent + MutationObserver re-attaches
  // anyway) so a fresh document never runs unstyled.
  const onNavigateInPage = () => {
    if (navDebounce) clearTimeout(navDebounce);
    navDebounce = setTimeout(() => {
      if (!mainWindow.webContents.isDestroyed()) {
        injectInto(mainWindow.webContents, payloadDir);
      }
    }, 500);
  };

  mainWindow.webContents.on('did-finish-load', onFinishLoad);
  mainWindow.webContents.on('did-navigate-in-page', onNavigateInPage);

  Object.defineProperty(mainWindow, '__dmAttached', {
    value: MARKER,
    writable: false,
    configurable: true,
    enumerable: false,
  });
  return MARKER;
}

module.exports = {
  attach,
  MARKER,
  PAGE_MARKER_ID,
  resolvePayloadDir,
  buildBootstrap,
};
