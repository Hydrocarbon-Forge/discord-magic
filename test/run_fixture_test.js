// discord-magic W2 — fixture test (node + jsdom).
// Proves the visual logic without a live patched client:
//   - glass classes attach to all [data-list-id]/[role=list] surfaces (+ rows)
//   - foil stage wraps popout CARDS (layer path + card-direct/modal path)
//   - mousemove updates tilt CSS vars + sheen background-position
//   - MutationObserver re-attaches to dynamically added nodes
//   - live diagnostic report: #discord-magic-ready[data-dm-report],
//     window.__DM.report(), console.log on injection AND re-injection
//   - proof-of-life badge present, draggable, dblclick-hides (localStorage)
//   - physics stub is a safe no-op
// Evaluates the EXACT bootstrap string loader-v1.js injects.
// Run: npm run test:p1   (or: node test/run_fixture_test.js)
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('jsdom not installed. Run: npm install');
  process.exit(2);
}

const REPO = path.join(__dirname, '..');
// Pin the loader to THIS repo's payload (resolvePayloadDir prefers the live
// ~/.config/discord-magic dir, which holds the last resync — the test must
// exercise the working-tree files).
process.env.DISCORD_MAGIC_DIR = REPO;
const loader = require('../loader/loader-v1.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`ok   ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    failures++;
    console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function main() {
  const html = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://discord.com/app',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;

  // Capture page-side console.log (the [discord-magic] report line).
  const pageLogs = [];
  try {
    const origLog = window.console.log.bind(window.console);
    window.console.log = (...a) => {
      pageLogs.push(a);
      try { origLog(...a); } catch (_) {}
    };
  } catch (e) {
    failures++;
    console.log('FAIL console capture hook');
  }

  // Evaluate the exact loader bootstrap in the fixture window.
  const payloadDir = loader.resolvePayloadDir();
  const bootstrap = loader.buildBootstrap(payloadDir);
  check('bootstrap embeds glass css', bootstrap.includes('backdrop-filter'));
  check('bootstrap embeds foil css', bootstrap.includes('conic-gradient'));
  const ret = window.eval(bootstrap);
  check('bootstrap returns injected', ret === 'discord-magic:injected', String(ret));
  // Idempotent re-run: no-op return AND a fresh report is logged.
  const logsBefore = pageLogs.length;
  check('bootstrap re-run is no-op', window.eval(bootstrap) === 'discord-magic:already');
  check('re-injection logs live report',
    pageLogs.length > logsBefore && pageLogs.slice(logsBefore).some((a) => a[0] === '[discord-magic]'),
    `${pageLogs.length - logsBefore} new log(s)`);

  const doc = window.document;
  check('marker node present', !!doc.getElementById('discord-magic-ready'));
  check(
    'glass style tag installed',
    !!doc.getElementById('dm-glass-style') && !!doc.getElementById('dm-foil-style')
  );

  // A. Live diagnostic report on the marker node.
  const marker = doc.getElementById('discord-magic-ready');
  const rawReport = marker && marker.getAttribute('data-dm-report');
  let rep = null;
  try {
    rep = JSON.parse(rawReport);
  } catch (e) {
    rep = null;
  }
  check('marker carries data-dm-report JSON', !!rep);
  check('report version w2', rep && rep.v === 'w2', rep && `v=${rep.v}`);
  check('report has all fields',
    !!rep && ['ts', 'ready', 'surfacesMatched', 'rowsMatched', 'layersFound',
      'cssInstalled', 'storeHandles', 'errors'].every((k) => k in rep));
  check('report surfacesMatched counts sane',
    !!rep && rep.surfacesMatched['[data-list-id]'] >= 4 && rep.surfacesMatched['[role="list"]'] >= 4,
    rep && JSON.stringify(rep.surfacesMatched));
  check('report rowsMatched >= 7', !!rep && rep.rowsMatched >= 7, rep && `rows=${rep.rowsMatched}`);
  check('report layersFound names real layer classes',
    !!rep && rep.layersFound.includes('positionLayer__31a96') &&
    rep.layersFound.includes('positionedLayer__31fc2'),
    rep && JSON.stringify(rep.layersFound));
  check('report cssInstalled both true',
    !!rep && rep.cssInstalled.glass === true && rep.cssInstalled.foil === true);
  check('report storeHandles keys present',
    !!rep && 'mediaEngine' in rep.storeHandles && 'voiceState' in rep.storeHandles);
  check('report errors is array', !!rep && Array.isArray(rep.errors));

  // window.__DM.report() returns the same object shape, refreshed live.
  const rep2 = window.__DM.report();
  check('__DM.report() matches marker report',
    !!rep2 && rep2.v === 'w2' && rep2.rowsMatched === rep.rowsMatched &&
    JSON.stringify(rep2.surfacesMatched) === JSON.stringify(rep.surfacesMatched));

  // F1: all real-scope surfaces glassed (channels, guildsnav, people-list
  // + the unknown-scope fallback probe).
  const surfaces = doc.querySelectorAll('[data-list-id].dm-glass');
  check('glass on all 4 data-list-id surfaces', surfaces.length === 4, `found ${surfaces.length}`);
  const roleLists = doc.querySelectorAll('[role="list"].dm-glass');
  check('glass via role=list hook too', roleLists.length === 4, `found ${roleLists.length}`);
  const rows = doc.querySelectorAll('[data-list-item-id].dm-glass-row.dm-jelly');
  check('glass+jelly on all 7 rows', rows.length === 7, `found ${rows.length}`);
  const roleItems = doc.querySelectorAll('[role="listitem"].dm-glass-row');
  check('rows via role=listitem hook too', roleItems.length === 7, `found ${roleItems.length}`);

  // F2: foil stages wrap CARDS on both layer spellings (never the layer).
  const stages = doc.querySelectorAll('.dm-foil-stage');
  check('two foil stages (both layer spellings)', stages.length === 2, `found ${stages.length}`);
  let wrapsOk = true;
  stages.forEach((stage) => {
    const tilt = stage.querySelector(':scope > .dm-foil-tilt');
    const card = tilt && tilt.querySelector('.profilePopout__1add6');
    const sheen = tilt && tilt.querySelector(':scope > .dm-foil-sheen');
    if (!tilt || !card || !sheen) wrapsOk = false;
    // The layer container itself must never be reparented into a tilt.
    if (card && (card.className.includes('positionLayer') || card.className.includes('positionedLayer'))) wrapsOk = false;
  });
  check('each stage wraps the card (tilt+sheen), never the layer', wrapsOk);
  const etched = doc.querySelector('.profilePopout__1add6 .username__9f8e7d.dm-etch');
  check('etch class on name node', !!etched);

  const stage = stages[0];
  const tilt = stage.querySelector(':scope > .dm-foil-tilt');
  const sheen = tilt.querySelector(':scope > .dm-foil-sheen');

  // F2: mousemove drives vars (clientX=right edge => +ry).
  const before_ry = tilt.style.getPropertyValue('--dm-ry');
  stage.dispatchEvent(new window.MouseEvent('mousemove', {
    bubbles: true, clientX: 190, clientY: 10,
  }));
  const rx = tilt.style.getPropertyValue('--dm-rx');
  const ry = tilt.style.getPropertyValue('--dm-ry');
  check('mousemove sets --dm-rx/--dm-ry', rx !== '' && ry !== '', `rx=${rx} ry=${ry}`);
  check('tilt within ±12deg',
    Math.abs(parseFloat(rx)) <= 12 && Math.abs(parseFloat(ry)) <= 12, `rx=${rx} ry=${ry}`);
  check('tilt actually moved', ry !== before_ry, `before=${before_ry || '(unset)'} after=${ry}`);
  const bgp = sheen.style.backgroundPosition;
  check('sheen background-position tracks cursor', /%/.test(bgp), bgp);
  // mouseleave resets.
  stage.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
  check('mouseleave resets tilt',
    tilt.style.getPropertyValue('--dm-rx') === '0deg' &&
    tilt.style.getPropertyValue('--dm-ry') === '0deg');

  // Observer re-attach: add a row + a fresh popout layer dynamically.
  const list = doc.querySelector('[data-list-id="channels"]');
  const li = doc.createElement('div');
  li.setAttribute('role', 'listitem');
  li.setAttribute('data-list-item-id', 'channels___999');
  li.textContent = 'Late Joiner';
  list.appendChild(li);
  const layer = doc.createElement('div');
  layer.className = 'positionLayer__99aa9';
  const pop = doc.createElement('div');
  pop.className = 'profilePopout__zzz';
  pop.innerHTML = '<h4 class="username__q">Newcomer</h4>';
  layer.appendChild(pop);
  doc.body.appendChild(layer);
  await new Promise((r) => setTimeout(r, 50)); // let MutationObserver fire
  check('observer attaches glass to late row',
    li.classList.contains('dm-glass-row') && li.classList.contains('dm-jelly'));
  const lateStage = layer.querySelector('.dm-foil-stage');
  check('observer wraps late popout', !!lateStage);
  check('late wrap targets the card, not the layer container',
    !!lateStage && !!lateStage.querySelector('.profilePopout__zzz') && layer.firstElementChild === lateStage);

  // Proof-of-life badge.
  const badge = doc.getElementById('dm-proof-badge');
  check('proof-of-life badge present', !!badge);
  check('badge reads liquid', !!badge && badge.textContent.includes('liquid'));
  badge.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  check('dblclick hides badge (class-only)', badge.classList.contains('dm-hidden'));
  check('badge hide persisted to localStorage',
    window.localStorage.getItem('dm-badge-hidden') === '1');

  // Report refreshes live after DOM changes.
  const rep3 = window.__DM.report();
  check('report refreshes (rows grew)', !!rep3 && rep3.rowsMatched === 8, rep3 && `rows=${rep3.rowsMatched}`);

  // Physics stub contract.
  const spring = window.__DM.physics.installSpring(doc.body, { preset: 'press' });
  check('physics stub installSpring/dispose', !!spring && typeof spring.dispose === 'function');
  spring.dispose();

  // Store handles exist (null in fixture is fine — no real webpack here).
  check('store handles exposed', 'MediaEngineStore' in window.__DM && 'VoiceStateStore' in window.__DM);

  // React-safety: no React-owned subtree restructured — row children intact.
  check('row content untouched',
    doc.querySelector('[data-list-item-id="channels___111"]').textContent === '# general' &&
    doc.querySelector('[data-list-item-id="people-list___331"]').textContent === 'Nathan');

  console.log(failures === 0 ? '\nP1-FIXTURE: ALL PASS' : `\nP1-FIXTURE: ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('fixture harness error:', e);
  process.exit(1);
});
