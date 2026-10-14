// discord-magic payload: stores.js (P1).
// Webpack module-cache scan + hash-agnostic style-map resolver.
// Runs in the page main world (injected by loader-v1.js). No imports —
// concatenated after `window.__DM.css` is seeded. Attaches to `window.__DM`.
;(function () {
  window.__DM = window.__DM || {};
  if (window.__DM.stores) return; // idempotent

  // Capture the internal webpack require by pushing a sentinel chunk.
  // Standard module-smuggling hook; works with `window.webpackChunkdiscord_app`.
  function getWebpackRequire() {
    if (window.__DM.__wpRequire) return window.__DM.__wpRequire;
    const chunk = window.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== 'function') {
      throw new Error('[discord-magic] webpackChunkdiscord_app not found');
    }
    let captured = null;
    chunk.push([
      [Symbol('discord-magic-probe')],
      {},
      function (r) {
        captured = r;
      },
    ]);
    if (!captured) throw new Error('[discord-magic] webpack require capture failed');
    window.__DM.__wpRequire = captured;
    return captured;
  }

  // Iterate the module cache `require.c` (object keyed by module id).
  function eachCachedModule(requireFn, visit) {
    const cache = requireFn.c || {};
    const ids = Object.keys(cache);
    for (let i = 0; i < ids.length; i++) {
      const m = cache[ids[i]];
      if (!m || !('exports' in m)) continue;
      const stop = visit(m.exports, ids[i]);
      if (stop === true) return;
    }
  }

  // Find the first cached export matching `predicate(exports)`.
  function findInCache(predicate, limit) {
    const req = getWebpackRequire();
    let found = null;
    let scanned = 0;
    eachCachedModule(req, function (exp) {
      scanned++;
      if (limit && scanned > limit) return true;
      try {
        if (predicate(exp)) {
          found = exp;
          return true;
        }
      } catch (_) {
        // ignore getter explosions in foreign modules
      }
      // Unwrap ES-module default interop one level.
      try {
        if (exp && typeof exp === 'object' && exp.__esModule && exp.default && predicate(exp.default)) {
          found = exp.default;
          return true;
        }
      } catch (_) {}
      return false;
    });
    return found;
  }

  function hasFns(obj, names) {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
    return names.every(function (n) {
      return typeof obj[n] === 'function';
    });
  }

  // Store handles for later waves (P3 drives these natively). Best-effort:
  // returns null instead of throwing when the client build renamed things.
  function findMediaEngineStore() {
    return (
      findInCache(function (e) {
        return hasFns(e, ['setLocalPan', 'getLocalVolume']);
      }) || null
    );
  }

  function findVoiceStateStore() {
    return (
      findInCache(function (e) {
        return hasFns(e, ['getVoiceStatesForChannel']);
      }) || null
    );
  }

  // Hash-agnostic class resolver. Discord ships CSS Modules as
  // `origName__hash` (e.g. `positionedLayer__31fc2`); hashes rotate per web
  // build, so NEVER hardcode them. Style maps are tiny modules shaped like
  // `{minKey: "origName__hash", ...}` — readable values, minified keys.
  // Scan cached exports for string values matching `^origName__[0-9a-f]+$`.
  function resolveClass(origName) {
    const re = new RegExp('^' + origName + '__[0-9a-f]{4,8}$');
    const hit =
      findInCache(function (e) {
        if (!e || typeof e !== 'object') return false;
        for (const k in e) {
          try {
            if (typeof e[k] === 'string' && re.test(e[k])) return true;
          } catch (_) {}
        }
        return false;
      }) || null;
    if (!hit) return null;
    for (const k in hit) {
      try {
        if (typeof hit[k] === 'string' && re.test(hit[k])) return hit[k];
      } catch (_) {}
    }
    return null;
  }

  // Resolve many names at once; unresolved entries map to null (caller falls
  // back to attribute selectors). Never throws on a missing class.
  function resolveStyleMap(origNames) {
    const out = {};
    origNames.forEach(function (n) {
      try {
        out[n] = resolveClass(n);
      } catch (_) {
        out[n] = null;
      }
    });
    return out;
  }

  window.__DM.stores = {
    getWebpackRequire: getWebpackRequire,
    findInCache: findInCache,
    findMediaEngineStore: findMediaEngineStore,
    findVoiceStateStore: findVoiceStateStore,
    resolveClass: resolveClass,
    resolveStyleMap: resolveStyleMap,
  };
})();
