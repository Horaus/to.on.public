const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("UI-direct video payload transports only the complete shot keyframe", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../workflow/src/orchestration/video-provider-actions.ts"), "utf8");
  const builder = source.match(/function providerJobReferences[\s\S]*?\n}\n\nfunction dispatchProviderPayload/)?.[0] || "";
  const videoReferences = builder.match(/const references = isVideoProvider \? \[[\s\S]*?\] : \[/)?.[0] || "";
  assert.match(videoReferences, /referenceRole: "shot_keyframe"/);
  assert.doesNotMatch(videoReferences, /semanticReferences\.map/);
  assert.match(builder, /return \{ references, semanticReferences \}/);
});

test("UI-direct preflight keeps semantic identity evidence outside transport", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../workflow/src/orchestration/video-provider-actions.ts"), "utf8");
  assert.match(source, /const preflightReferences = isVideoProvider \? \[/);
  assert.match(source, /semanticVideoReferences\.map/);
  assert.match(source, /references: preflightReferences/);
  assert.match(source, /dispatchProviderPayload\([^;]*videoReferences/);
});
