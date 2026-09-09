const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WINDOW_MODES,
  COMPACT_TARGET,
  COMPACT_MINIMUM,
  normalizeWindowMode,
  compactBounds,
  maximizedBounds,
  boundsForWindowMode,
  compactViewportIsSupported,
  windowModeSnapshot
} = require("../main/window-mode.cjs");

test("window mode normalizes unknown values to the safe compact mode", () => {
  assert.equal(normalizeWindowMode(WINDOW_MODES.MAXIMIZED), WINDOW_MODES.MAXIMIZED);
  assert.equal(normalizeWindowMode("fullscreen"), WINDOW_MODES.COMPACT);
  assert.equal(normalizeWindowMode(undefined), WINDOW_MODES.COMPACT);
});

test("compact mode centers the preferred surface inside the display work area", () => {
  assert.deepEqual(compactBounds({ x: 20, y: 40, width: 1600, height: 1100 }), {
    x: 220, y: 130, width: COMPACT_TARGET.width, height: COMPACT_TARGET.height
  });
});

test("compact mode clamps to a smaller work area instead of creating an off-screen window", () => {
  const bounds = compactBounds({ x: -100, y: 0, width: 1024, height: 768 });
  assert.deepEqual(bounds, { x: -100, y: 0, width: 1024, height: 768 });
  assert.equal(compactViewportIsSupported(bounds), false);
  assert.equal(COMPACT_MINIMUM.width, 1180);
});

test("maximized mode occupies only the display work area", () => {
  assert.deepEqual(maximizedBounds({ x: -1920, y: 10, width: 1920, height: 1050 }), {
    x: -1920, y: 10, width: 1920, height: 1050
  });
  assert.deepEqual(boundsForWindowMode(WINDOW_MODES.MAXIMIZED, { x: 0, y: 0, width: 1400, height: 900 }), {
    x: 0, y: 0, width: 1400, height: 900
  });
});

test("window mode snapshot exposes the mode and compact support without leaking implementation state", () => {
  assert.deepEqual(windowModeSnapshot(WINDOW_MODES.COMPACT, { x: 10, y: 20, width: 1200, height: 920 }, 7), {
    mode: WINDOW_MODES.COMPACT,
    bounds: { x: 10, y: 20, width: 1200, height: 920 },
    displayId: "7",
    compactViewportSupported: true
  });
});
