const WINDOW_MODES = Object.freeze({
  COMPACT: "compact",
  MAXIMIZED: "maximized"
});

const COMPACT_TARGET = Object.freeze({ width: 1200, height: 920 });
const COMPACT_MINIMUM = Object.freeze({ width: 1180, height: 760 });

function normalizeWindowMode(value) {
  return value === WINDOW_MODES.MAXIMIZED ? WINDOW_MODES.MAXIMIZED : WINDOW_MODES.COMPACT;
}

function finiteDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeWorkArea(workArea = {}) {
  return {
    x: Number.isFinite(Number(workArea.x)) ? Math.floor(Number(workArea.x)) : 0,
    y: Number.isFinite(Number(workArea.y)) ? Math.floor(Number(workArea.y)) : 0,
    width: finiteDimension(workArea.width, COMPACT_TARGET.width),
    height: finiteDimension(workArea.height, COMPACT_TARGET.height)
  };
}

function compactBounds(workArea = {}) {
  const area = normalizeWorkArea(workArea);
  const width = Math.min(COMPACT_TARGET.width, area.width);
  const height = Math.min(COMPACT_TARGET.height, area.height);
  return {
    x: area.x + Math.max(0, Math.floor((area.width - width) / 2)),
    y: area.y + Math.max(0, Math.floor((area.height - height) / 2)),
    width,
    height
  };
}

function maximizedBounds(workArea = {}) {
  const area = normalizeWorkArea(workArea);
  return { ...area };
}

function boundsForWindowMode(mode, workArea = {}) {
  return normalizeWindowMode(mode) === WINDOW_MODES.MAXIMIZED
    ? maximizedBounds(workArea)
    : compactBounds(workArea);
}

function compactViewportIsSupported(bounds = {}) {
  return Number(bounds.width) >= COMPACT_MINIMUM.width && Number(bounds.height) >= COMPACT_MINIMUM.height;
}

function windowModeSnapshot(mode, bounds, displayId) {
  const normalizedMode = normalizeWindowMode(mode);
  const safeBounds = {
    x: Number(bounds?.x) || 0,
    y: Number(bounds?.y) || 0,
    width: finiteDimension(bounds?.width, COMPACT_TARGET.width),
    height: finiteDimension(bounds?.height, COMPACT_TARGET.height)
  };
  return {
    mode: normalizedMode,
    bounds: safeBounds,
    displayId: displayId == null ? undefined : String(displayId),
    compactViewportSupported: compactViewportIsSupported(safeBounds)
  };
}

module.exports = {
  WINDOW_MODES,
  COMPACT_TARGET,
  COMPACT_MINIMUM,
  normalizeWindowMode,
  compactBounds,
  maximizedBounds,
  boundsForWindowMode,
  compactViewportIsSupported,
  windowModeSnapshot
};
