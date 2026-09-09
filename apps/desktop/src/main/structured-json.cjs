function balancedJsonObjectCandidates(text = "") {
  const candidates = [];
  const state = { start: -1, depth: 0, inString: false, escaped: false };
  for (let index = 0; index < text.length; index += 1) {
    consumeJsonScanCharacter(text[index], index, state, candidates, text);
  }
  return candidates;
}

function consumeJsonScanCharacter(char, index, state, candidates, text) {
  if (state.escaped) { state.escaped = false; return; }
  if (char === "\\" && state.inString) { state.escaped = true; return; }
  if (char === '"') state.inString = !state.inString;
  if (state.inString) return;
  if (char === "{") {
    if (state.depth === 0) state.start = index;
    state.depth += 1;
    return;
  }
  if (char === "}" && state.depth > 0) {
    state.depth -= 1;
    if (state.depth === 0 && state.start >= 0) {
      candidates.push(text.slice(state.start, index + 1));
      state.start = -1;
    }
  }
}

module.exports = { balancedJsonObjectCandidates };
