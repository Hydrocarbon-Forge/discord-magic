// discord-magic payload: mod.js (W2) — page main-world bootstrap.
// Injected by loader-v1.js AFTER stores.js and physics.js (concatenated in
// that order, one eval). Responsibilities:
//   - install glass.css / foil.css from window.__DM.css (seeded by loader)
//   - resolve the hashed style-map (best effort, hash-agnostic)
//   - expose store handles (MediaEngineStore, VoiceStateStore) for later waves
//   - attach F1 glass observers + F2 foil tilt observers (MutationObserver,
//     SPA-safe re-attach). CSS classes only — never restructure React-owned
//     subtrees (foil reparenting is limited to the popout CARD element, never
//     the positioned layer container).
//   - write a live diagnostic report to #discord-magic-ready[data-dm-report],
//     expose window.__DM.report(), console.log it on each (re)injection.
//   - show a small proof-of-life badge (localStorage-hidden, dblclick hides).
// Idempotent: re-running refreshes the report but never double-wraps.
// Selector basis (verified vs build 637268 bundle, see VERIFY_W2.md §2):
//   - containers: [data-list-id] (value = raw runtime scope, e.g. "channels",
//     "guildsnav", "people-list" — NEVER a literal like "guild-channels") and
//     [role="list"]; rows: [data-list-item-id] ("<scope>___<item>") and
//     [role="listitem"]. Presence-based: fully build-agnostic.
//   - layers: [class*="positionedLayer"], [class*="positionLayer"],
//     [class*="popoutLayer"]; cards: [class*="profilePopout"],
//     [class*="accountPopout"], [class*="userPopout"].
;(function () {
  window.__DM = window.__DM || {};
  var DM = window.__DM;
  DM.__errors = DM.__errors || [];
  if (DM.ready) {
    // Re-injection (loader calls report() itself): refresh + log, no re-wrap.
    try {
      if (typeof DM.report === 'function') DM.report();
    } catch (e) {}
    return;
  }
  var stores = DM.stores || null;

  function noteError(where, e) {
    try {
      DM.__errors.push(where + ': ' + ((e && e.message) || String(e)));
    } catch (_) {}
  }

  /* 1. CSS install ------------------------------------------------------ */
  function installCss(id, text) {
    if (!text) return;
    if (document.getElementById(id)) return;
    var head = document.head || document.documentElement;
    var s = document.createElement('style');
    s.id = id;
    s.setAttribute('data-dm', 'w2');
    s.textContent = text;
    head.appendChild(s);
  }
  if (DM.css) {
    installCss('dm-glass-style', DM.css.glass);
    installCss('dm-foil-style', DM.css.foil);
  }

  /* 2. Store handles (best effort; null when the build renamed things) --- */
  DM.MediaEngineStore = null;
  DM.VoiceStateStore = null;
  if (stores) {
    try {
      DM.MediaEngineStore = stores.findMediaEngineStore();
    } catch (e) {
      DM.MediaEngineStore = null;
      noteError('mediaEngine', e);
    }
    try {
      DM.VoiceStateStore = stores.findVoiceStateStore();
    } catch (e) {
      DM.VoiceStateStore = null;
      noteError('voiceState', e);
    }
  }

  /* 3. Style-map resolution (best effort, hash-agnostic) ----------------- */
  DM.classes = {};
  if (stores) {
    try {
      DM.classes = stores.resolveStyleMap([
        'positionedLayer',
        'positionLayer',
        'popoutLayer',
        'profilePopout',
        'accountPopout',
        'userPopout',
        'members',
        'member',
        'channel',
        'chat',
        'messages',
      ]);
    } catch (e) {
      DM.classes = {};
      noteError('stylemap', e);
    }
  }

  /* 4. F1 — liquid glass + jelly (build-agnostic hooks) ------------------ */
  // Verified: data-list-id values are runtime scopes ("channels",
  // "guildsnav", "people-list", ...); data-list-item-id is
  // "<scope>___<item>". No literal is stable, so match by PRESENCE.
  var GLASS_SURFACES = ['[data-list-id]', '[role="list"]'];
  var GLASS_ROWS = ['[data-list-item-id]', '[role="listitem"]'];

  // Guarded class-add: skip when already present so a sweep never writes
  // (a no-op set can still queue an attribute record in some DOMs and
  // ping-pong the observer forever).
  function addClass(el, cls) {
    try {
      if (!el.classList.contains(cls)) el.classList.add(cls);
    } catch (e) {}
  }

  // Mark a single element if it IS a surface/row (querySelectorAll only
  // covers descendants, never the root itself).
  function markGlassSelf(el) {
    if (!el || typeof el.matches !== 'function') return;
    try {
      for (var i = 0; i < GLASS_SURFACES.length; i++) {
        if (el.matches(GLASS_SURFACES[i])) {
          addClass(el, 'dm-glass');
          break;
        }
      }
      for (var j = 0; j < GLASS_ROWS.length; j++) {
        if (el.matches(GLASS_ROWS[j])) {
          addClass(el, 'dm-glass-row');
          addClass(el, 'dm-jelly');
          break;
        }
      }
    } catch (e) {}
  }

  function applyGlass(root) {
    var scope = root && root.querySelectorAll ? root : document;
    // The added node itself may BE the surface/row (not just a container).
    markGlassSelf(scope);
    var i, k, els;
    for (i = 0; i < GLASS_SURFACES.length; i++) {
      try {
        els = scope.querySelectorAll(GLASS_SURFACES[i] + ':not(.dm-glass)');
      } catch (e) {
        continue;
      }
      for (k = 0; k < els.length; k++) addClass(els[k], 'dm-glass');
    }
    // Rows: the stable member/voice/channel row hook.
    for (i = 0; i < GLASS_ROWS.length; i++) {
      try {
        els = scope.querySelectorAll(GLASS_ROWS[i] + ':not(.dm-glass-row)');
      } catch (e) {
        continue;
      }
      for (k = 0; k < els.length; k++) {
        addClass(els[k], 'dm-glass-row');
        addClass(els[k], 'dm-jelly');
      }
    }
  }

  /* 5. F2 — holographic foil 3D-tilt cards ------------------------------- */
  var MAX_TILT_DEG = 12;
  var LAYER_SELECTORS = [
    '[class*="positionedLayer"]',
    '[class*="positionLayer"]',
    '[class*="popoutLayer"]',
  ];
  var CARD_SELECTORS = [
    '[class*="profilePopout"]',
    '[class*="accountPopout"]',
    '[class*="userPopout"]',
  ];

  function isLayerNode(el) {
    if (!el || !el.className || typeof el.className !== 'string') return false;
    return (
      el.className.indexOf('positionedLayer') !== -1 ||
      el.className.indexOf('positionLayer') !== -1 ||
      el.className.indexOf('popoutLayer') !== -1
    );
  }

  function isCardNode(el) {
    if (!el || !el.className || typeof el.className !== 'string') return false;
    return (
      el.className.indexOf('profilePopout') !== -1 ||
      el.className.indexOf('accountPopout') !== -1 ||
      el.className.indexOf('userPopout') !== -1
    );
  }

  // Wrap the popout CARD in stage > tilt (+ sheen overlay). The original
  // node's attributes/children are untouched; only reparented one level.
  // Never wraps the layer container itself (React-positioned).
  function wrapPopout(root) {
    if (!root || !root.parentNode) return false;
    if (isLayerNode(root)) return false; // card required, never the layer
    if (
      root.parentNode.classList &&
      root.parentNode.classList.contains('dm-foil-tilt')
    ) {
      return false; // already wrapped
    }
    var doc = root.ownerDocument || document;
    var stage = doc.createElement('div');
    stage.className = 'dm-foil-stage';
    var tilt = doc.createElement('div');
    tilt.className = 'dm-foil-tilt';
    var sheen = doc.createElement('div');
    sheen.className = 'dm-foil-sheen';
    sheen.setAttribute('aria-hidden', 'true');

    root.parentNode.insertBefore(stage, root);
    tilt.appendChild(root);
    tilt.appendChild(sheen);
    stage.appendChild(tilt);

    // "Metal etching" text: class-only treatment for name-ish descendants.
    try {
      var names = root.querySelectorAll(
        'h1,h2,h3,h4,[class*="username"],[class*="nickname"],[class*="displayName"],[class*="heading"]'
      );
      for (var i = 0; i < names.length; i++) addClass(names[i], 'dm-etch');
    } catch (e) {
      // text treatment is cosmetic; never fail the wrap
    }

    stage.addEventListener('mousemove', function (ev) {
      var r = { left: 0, top: 0, width: 0, height: 0 };
      try {
        r = stage.getBoundingClientRect();
      } catch (e) {
        // jsdom / pre-layout fallback below
      }
      var w = r.width || 200;
      var h = r.height || 200;
      var px = (ev.clientX - (r.left || 0)) / w - 0.5;
      var py = (ev.clientY - (r.top || 0)) / h - 0.5;
      if (px > 0.5) px = 0.5;
      if (px < -0.5) px = -0.5;
      if (py > 0.5) py = 0.5;
      if (py < -0.5) py = -0.5;
      var ry = px * 2 * MAX_TILT_DEG;
      var rx = -py * 2 * MAX_TILT_DEG;
      tilt.style.setProperty('--dm-rx', rx.toFixed(2) + 'deg');
      tilt.style.setProperty('--dm-ry', ry.toFixed(2) + 'deg');
      var fx = (px * 100 + 50).toFixed(1) + '%';
      var fy = (py * 100 + 50).toFixed(1) + '%';
      tilt.style.setProperty('--dm-foil-x', fx);
      tilt.style.setProperty('--dm-foil-y', fy);
      // Direct inline position too, so the sheen tracks the cursor even
      // where CSS-var-driven background-position is not computed.
      sheen.style.backgroundPosition = fx + ' ' + fy;
      sheen.style.setProperty('--dm-foil-x', fx);
      sheen.style.setProperty('--dm-foil-y', fy);
    });
    stage.addEventListener('mouseleave', function () {
      tilt.style.setProperty('--dm-rx', '0deg');
      tilt.style.setProperty('--dm-ry', '0deg');
      tilt.style.setProperty('--dm-foil-x', '50%');
      tilt.style.setProperty('--dm-foil-y', '50%');
      sheen.style.backgroundPosition = '50% 50%';
    });
    return true;
  }

  function collectCandidates(scope, out) {
    var i;
    // The added node itself may BE the card (modal path) or the layer
    // (hover path: wrap its card child, never the layer container).
    if (scope !== document) {
      if (isCardNode(scope)) {
        out.push(scope);
      } else if (isLayerNode(scope) && scope.firstElementChild) {
        out.push(scope.firstElementChild);
      }
    }
    var els;
    for (i = 0; i < LAYER_SELECTORS.length; i++) {
      try {
        els = scope.querySelectorAll(LAYER_SELECTORS[i]);
      } catch (e) {
        continue;
      }
      for (var k = 0; k < els.length; k++) {
        // Only wrap layers that actually host a popout card child.
        if (els[k].firstElementChild) out.push(els[k].firstElementChild);
      }
    }
    // Card-direct path: hover popouts AND profile modals render the same
    // profilePopout-family card; catch cards mounted outside a layer too.
    for (i = 0; i < CARD_SELECTORS.length; i++) {
      try {
        els = scope.querySelectorAll(CARD_SELECTORS[i]);
      } catch (e) {
        continue;
      }
      for (var j = 0; j < els.length; j++) out.push(els[j]);
    }
  }

  function scanLayers(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var candidates = [];
    try {
      collectCandidates(scope, candidates);
    } catch (e) {
      noteError('scanLayers', e);
    }
    for (var j = 0; j < candidates.length; j++) {
      try {
        wrapPopout(candidates[j]);
      } catch (e) {
        noteError('wrapPopout', e);
      }
    }
  }

  /* 6. Observers (SPA-safe re-attach) ------------------------------------ */
  function sweep(target) {
    try {
      applyGlass(target);
    } catch (e) {
      noteError('applyGlass', e);
    }
    try {
      scanLayers(target);
    } catch (e) {
      noteError('scanLayers', e);
    }
  }

  function startObservers() {
    applyGlass(document);
    scanLayers(document);
    if (!('MutationObserver' in window)) return;
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n && n.nodeType === 1) sweep(n);
          }
        } else if (m.target && m.target.nodeType === 1) {
          // Class flips on existing nodes (channel switches) can reveal
          // new surfaces without added nodes.
          if (
            m.target.hasAttribute &&
            (m.target.hasAttribute('data-list-id') ||
              m.target.hasAttribute('data-list-item-id'))
          ) {
            sweep(m.target);
          }
        }
      }
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-list-id', 'data-list-item-id'],
    });
    DM.__observer = obs;
  }

  /* 7. Live diagnostic report -------------------------------------------- */
  function countSel(sel) {
    try {
      return document.querySelectorAll(sel).length;
    } catch (e) {
      return 0;
    }
  }

  function buildReport() {
    var surfacesMatched = {};
    for (var i = 0; i < GLASS_SURFACES.length; i++) {
      surfacesMatched[GLASS_SURFACES[i]] = countSel(
        GLASS_SURFACES[i] + '.dm-glass'
      );
    }
    var layersFound = [];
    try {
      var layerNodes = document.querySelectorAll('[class*="Layer"]');
      var seen = {};
      for (var k = 0; k < layerNodes.length; k++) {
        var cls = layerNodes[k].className;
        if (typeof cls !== 'string') continue;
        var parts = cls.split(/\s+/);
        for (var p = 0; p < parts.length; p++) {
          if (parts[p].indexOf('Layer') !== -1 && !seen[parts[p]]) {
            seen[parts[p]] = true;
            layersFound.push(parts[p]);
          }
        }
        if (layersFound.length >= 12) break;
      }
    } catch (e) {
      noteError('layersFound', e);
    }
    return {
      v: 'w2',
      ts: new Date().toISOString(),
      ready: !!DM.ready,
      surfacesMatched: surfacesMatched,
      rowsMatched: countSel('[data-list-item-id].dm-glass-row'),
      layersFound: layersFound,
      cssInstalled: {
        glass: !!document.getElementById('dm-glass-style'),
        foil: !!document.getElementById('dm-foil-style'),
      },
      storeHandles: {
        mediaEngine: !!DM.MediaEngineStore,
        voiceState: !!DM.VoiceStateStore,
      },
      errors: DM.__errors.slice(-8),
    };
  }

  // Fresh report on every call (live counts), mirrored to the marker node.
  DM.report = function () {
    var rep = buildReport();
    try {
      var el = document.getElementById('discord-magic-ready');
      if (el) el.setAttribute('data-dm-report', JSON.stringify(rep));
    } catch (e) {}
    return rep;
  };

  /* 8. Marker node + proof-of-life badge ---------------------------------- */
  function markReady() {
    var el = document.getElementById('discord-magic-ready');
    if (!el) {
      el = document.createElement('div');
      el.id = 'discord-magic-ready';
      el.setAttribute('data-dm-version', 'w2');
      el.setAttribute('style', 'display:none!important');
      (document.body || document.documentElement).appendChild(el);
    } else {
      el.setAttribute('data-dm-version', 'w2');
    }
    DM.report(); // mirror initial report to the marker
  }

  // Tiny always-present badge: proves the mod is active at a glance.
  // Draggable (transform-only), double-click hides (localStorage persists).
  function ensureBadge() {
    try {
      if (document.getElementById('dm-proof-badge')) return;
      var hidden = false;
      try {
        hidden =
          window.localStorage &&
          window.localStorage.getItem('dm-badge-hidden') === '1';
      } catch (e) {}
      if (hidden) return;
      var b = document.createElement('div');
      b.id = 'dm-proof-badge';
      b.className = 'dm-proof-badge';
      b.setAttribute('title', 'discord-magic active — drag to move, double-click to hide');
      var dot = document.createElement('span');
      dot.className = 'dm-proof-dot';
      dot.setAttribute('aria-hidden', 'true');
      b.appendChild(dot);
      var label = document.createElement('span');
      label.textContent = 'liquid';
      b.appendChild(label);
      (document.body || document.documentElement).appendChild(b);
      var bx = 0,
        by = 0,
        dragging = false,
        sx = 0,
        sy = 0;
      b.addEventListener('pointerdown', function (ev) {
        dragging = true;
        sx = ev.clientX - bx;
        sy = ev.clientY - by;
        try {
          b.setPointerCapture(ev.pointerId);
        } catch (e) {}
      });
      b.addEventListener('pointermove', function (ev) {
        if (!dragging) return;
        bx = ev.clientX - sx;
        by = ev.clientY - sy;
        b.style.setProperty('--dm-bx', bx.toFixed(0) + 'px');
        b.style.setProperty('--dm-by', by.toFixed(0) + 'px');
      });
      function stopDrag() {
        dragging = false;
      }
      b.addEventListener('pointerup', stopDrag);
      b.addEventListener('pointercancel', stopDrag);
      b.addEventListener('dblclick', function () {
        try {
          if (window.localStorage)
            window.localStorage.setItem('dm-badge-hidden', '1');
        } catch (e) {}
        addClass(b, 'dm-hidden');
      });
    } catch (e) {
      noteError('badge', e);
    }
  }

  DM.version = 'w2';
  function boot() {
    startObservers();
    markReady();
    ensureBadge();
    DM.ready = true;
    // Final report with ready:true, mirrored to the marker AND the console —
    // this is the live proof the user pastes back if anything looks off.
    try {
      console.log('[discord-magic]', DM.report());
    } catch (e) {}
  }
  if (document.body) {
    boot();
  } else {
    // Injected pre-body: wait for the root, then start.
    var bootObs = new MutationObserver(function () {
      if (document.body) {
        try {
          bootObs.disconnect();
        } catch (e) {}
        boot();
      }
    });
    bootObs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
