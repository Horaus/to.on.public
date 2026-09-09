export const SPATIAL_CONTINUITY_YAML = [
  "schema: spatial-continuity",
  "version: \"1.0\"",
  "rules:",
  "  fixed_anchors: tables, counters, doors, windows and other fixed props keep one world position",
  "  relation: describe each visible subject relative to an anchor, not only another subject",
  "  axis: preserve screen side, eyeline and camera-facing direction",
  "  transformation: a prop moves only when one authored cue owns that transformation",
  "  opposition: never move or duplicate a fixed anchor"
].join("\n");

export function spatialContinuityInstruction() {
  return `Use this compact YAML contract as the spatial source of truth:\n\`\`\`yaml\n${SPATIAL_CONTINUITY_YAML}\n\`\`\``;
}
