// discord-magic payload: physics.js — STUB ONLY (P1).
// P2 builds the real spring system (rAF loop, semi-implicit Euler springs
// driving CSS vars). F1/F2 reference this module so their call sites stay
// stable; every entry here is a no-op that disposes cleanly.
;(function () {
  window.__DM = window.__DM || {};
  if (window.__DM.physics) return; // idempotent

  function disposable() {
    return { dispose: function () {} };
  }

  window.__DM.physics = {
    version: 'stub-p1',
    // Placeholder for P2's spring driver. Signature (reserved):
    // installSpring(el, {stiffness, damping, preset}) -> {dispose()}
    installSpring: function () {
      return disposable();
    },
    // Reserved presets (P2): 'hover' | 'press' | 'settle'.
    presets: {},
  };
})();
