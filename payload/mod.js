// discord-magic payload: mod.js (P1) — page main-world bootstrap.
// Injected by loader-v1.js AFTER stores.js and physics.js (concatenated in
// that order, one eval). Responsibilities:
//   - install glass.css / foil.css from window.__DM.css (seeded by loader)
//   - resolve the hashed style-map (best effort, hash-agnostic)
//   - expose store handles (MediaEngineStore, VoiceStateStore) for later waves
//   - attach F1 glass observers + F2 foil tilt observers (MutationObserver,
//     SPA-safe re-attach). CSS classes only — never restructure React-owned
//     subtrees (foil reparenting is limited to the popout ROOT element).
// Idempotent: re-running returns early via window.__DM.ready.
;(function () {
  window.__DM = window.__DM || {};
  if (window.__DM.ready) return;
  var DM = window.__DM;
  var stores = DM.stores || null;

  /* 1. CSS install ------------------------------------------------------ */
  function installCss(id, text) {
    if (!text) return;
    if (document.getElementById(id)) return;
    var head = document.head || document.documentElement;
    var s = document.createElement('style');
    s.id = id;
    s.setAttribute('data-dm', 'p1');
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
    }
    try {
      DM.VoiceStateStore = stores.findVoiceStateStore();
    } catch (e) {
      DM.VoiceStateStore = null;
    }
  }

  /* 3. Style-map resolution (best effort, hash-agnostic) ----------------- */
  DM.classes = {};
  if (stores) {
    try {
      DM.classes = stores.resolveStyleMap([
        'positionedLayer',
        'positionLayer',
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
    }
  }

  /* 4. F1 — liquid glass + jelly ---------------------------------------- */
  // Stable hooks only: data-list-id attributes, roles, aria-labels, and the
  // [data-list-item-id] row pattern. Hashed classes are enhancement only.
  var GLASS_SURFACES = [
    '[data-list-id="guild-channels"]',
    'nav[aria-label="Channels"]',
    '[data-list-id="chat-messages"]',
    '[role="log"]',
    '[data-list-id="members"]',
    '[aria-label="Members"]',
  ];

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
      if (el.matches('[data-list-item-id]')) {
        addClass(el, 'dm-glass-row');
        addClass(el, 'dm-jelly');
      }
    } catch (e) {}
  }

  function applyGlass(root) {
    var scope = root && root.querySelectorAll ? root : document;
    // The added node itself may BE the surface/row (not just a container).
    markGlassSelf(scope);
    var i, els;
    for (i = 0; i < GLASS_SURFACES.length; i++) {
      try {
        els = scope.querySelectorAll(GLASS_SURFACES[i] + ':not(.dm-glass)');
      } catch (e) {
        continue;
      }
      for (var k = 0; k < els.length; k++) addClass(els[k], 'dm-glass');
    }
    // Rows: the stable member/voice/channel row hook.
    try {
      els = scope.querySelectorAll('[data-list-item-id]:not(.dm-glass-row)');
    } catch (e) {
      els = [];
    }
    for (var j = 0; j < els.length; j++) {
      addClass(els[j], 'dm-glass-row');
      addClass(els[j], 'dm-jelly');
    }
  }

  /* 5. F2 — holographic foil 3D-tilt cards ------------------------------- */
  var MAX_TILT_DEG = 12;

  function isLayerNode(el) {
    if (!el || !el.className || typeof el.className !== 'string') return false;
    return (
      el.className.indexOf('positionedLayer') !== -1 ||
      el.className.indexOf('positionLayer') !== -1
    );
  }

  // Wrap the popout ROOT in stage > tilt (+ sheen overlay). The original
  // node's attributes/children are untouched; only reparented one level.
  function wrapPopout(root) {
    if (!root || !root.parentNode) return false;
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

  function scanLayers(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var candidates = [];
    // The added node itself may BE the layer (wrap its card child, never
    // the layer container — the layer is React-positioned).
    if (scope !== document && isLayerNode(scope) && scope.firstElementChild) {
      candidates.push(scope.firstElementChild);
    }
    var els;
    try {
      els = scope.querySelectorAll('[class*="positionedLayer"],[class*="positionLayer"]');
    } catch (e) {
      els = [];
    }
    for (var i = 0; i < els.length; i++) {
      // Only wrap layers that actually host a popout card child.
      if (els[i].firstElementChild) candidates.push(els[i].firstElementChild);
    }
    for (var j = 0; j < candidates.length; j++) wrapPopout(candidates[j]);
  }

  /* 6. Observers (SPA-safe re-attach) ------------------------------------ */
  function sweep(target) {
    try {
      applyGlass(target);
    } catch (e) {}
    try {
      scanLayers(target);
    } catch (e) {}
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
      attributeFilter: ['class', 'data-list-id'],
    });
    DM.__observer = obs;
  }

  /* 7. Marker node -------------------------------------------------------- */
  function markReady() {
    if (document.getElementById('discord-magic-ready')) return;
    var el = document.createElement('div');
    el.id = 'discord-magic-ready';
    el.setAttribute('data-dm-version', 'p1');
    el.setAttribute('style', 'display:none!important');
    (document.body || document.documentElement).appendChild(el);
  }

  DM.version = 'p1';
  if (document.body) {
    startObservers();
    markReady();
    DM.ready = true;
  } else {
    // Injected pre-body: wait for the root, then start.
    var bootObs = new MutationObserver(function () {
      if (document.body) {
        try {
          bootObs.disconnect();
        } catch (e) {}
        startObservers();
        markReady();
        DM.ready = true;
      }
    });
    bootObs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
