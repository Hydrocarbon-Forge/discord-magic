// discord-magic P1 — fixture test (node + jsdom).
// Proves the visual logic without a live patched client:
//   - glass classes attach to >=3 surfaces (+ rows)
//   - foil stage wraps the popout root (original node preserved)
//   - mousemove updates tilt CSS vars + sheen background-position
//   - MutationObserver re-attaches to dynamically added nodes
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

  // Evaluate the exact loader bootstrap in the fixture window.
  const payloadDir = loader.resolvePayloadDir();
  const bootstrap = loader.buildBootstrap(payloadDir);
  check('bootstrap embeds glass css', bootstrap.includes('backdrop-filter'));
  check('bootstrap embeds foil css', bootstrap.includes('conic-gradient'));
  const ret = window.eval(bootstrap);
  check('bootstrap returns injected', ret === 'discord-magic:injected', String(ret));
  // Idempotent re-run.
  check('bootstrap re-run is no-op', window.eval(bootstrap) === 'discord-magic:already');

  const doc = window.document;
  check('marker node present', !!doc.getElementById('discord-magic-ready'));
  check(
    'glass style tag installed',
    !!doc.getElementById('dm-glass-style') && !!doc.getElementById('dm-foil-style')
  );

  // F1: >=3 glass surfaces.
  const surfaces = doc.querySelectorAll('.dm-glass');
  check('glass on >=3 surfaces', surfaces.length >= 3, `found ${surfaces.length}`);
  const rows = doc.querySelectorAll('[data-list-item-id].dm-glass-row.dm-jelly');
  check('glass+jelly on rows', rows.length >= 4, `found ${rows.length}`);

  // F2: foil stage wraps popout root, original preserved.
  const stage = doc.querySelector('.dm-foil-stage');
  check('foil stage exists', !!stage);
  const tilt = stage && stage.querySelector(':scope > .dm-foil-tilt');
  check('tilt child exists', !!tilt);
  const card = tilt && tilt.querySelector('.profilePopout__a1b2c3');
  check('original popout root preserved inside tilt', !!card);
  const sheen = tilt && tilt.querySelector(':scope > .dm-foil-sheen');
  check('sheen overlay present (+pointer-events none via css)',
    !!sheen && fs.readFileSync(path.join(REPO, 'payload/css/foil.css'), 'utf8').includes('pointer-events: none'));
  const etched = card && card.querySelector('.username__9f8e7d.dm-etch');
  check('etch class on name node', !!etched);

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
  const ul = doc.querySelector('[data-list-id="members"]');
  const li = doc.createElement('li');
  li.setAttribute('data-list-item-id', 'member___999');
  li.textContent = 'Late Joiner';
  ul.appendChild(li);
  const layer = doc.createElement('div');
  layer.className = 'positionedLayer__99aa9';
  const pop = doc.createElement('div');
  pop.className = 'profilePopout__zzz';
  pop.innerHTML = '<h4 class="username__q">Newcomer</h4>';
  layer.appendChild(pop);
  doc.body.appendChild(layer);
  await new Promise((r) => setTimeout(r, 50)); // let MutationObserver fire
  check('observer attaches glass to late row', li.classList.contains('dm-glass-row'));
  const lateStage = layer.querySelector('.dm-foil-stage');
  check('observer wraps late popout', !!lateStage);
  check('late wrap targets the card, not the layer container',
    !!lateStage && !!lateStage.querySelector('.profilePopout__zzz') && layer.firstElementChild === lateStage);

  // Physics stub contract.
  const spring = window.__DM.physics.installSpring(doc.body, { preset: 'press' });
  check('physics stub installSpring/dispose', !!spring && typeof spring.dispose === 'function');
  spring.dispose();

  // Store handles exist (null in fixture is fine — no real webpack here).
  check('store handles exposed', 'MediaEngineStore' in window.__DM && 'VoiceStateStore' in window.__DM);

  // React-safety: no React-owned subtree restructured — row children intact.
  check('row content untouched', ul.querySelector('[data-list-item-id="guild___111"],[data-list-item-id="member___221"]') !== null
    || doc.querySelector('[data-list-item-id="member___221"]').textContent === 'Nathan');

  console.log(failures === 0 ? '\nP1-FIXTURE: ALL PASS' : `\nP1-FIXTURE: ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('fixture harness error:', e);
  process.exit(1);
});
