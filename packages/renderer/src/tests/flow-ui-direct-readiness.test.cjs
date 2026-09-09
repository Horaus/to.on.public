const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("UI-direct Flow readiness accepts a published runtime-only project route", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-application-composition.ts"), "utf8");
  const readiness = source.match(/export function flowProjectTabIsReady[\s\S]*?\n}/)?.[0] || "";
  assert.match(readiness, /flowWorkspaceTabCount === 1/);
  assert.match(readiness, /flowWorkspaceTabCount === 0/);
  assert.match(readiness, /flowCustomToolTabCount === 1/);
  assert.match(readiness, /flowRuntimeToolTabCount === 1/);
});

test("UI-direct Flow readiness accepts one workspace without a runtime tab", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-application-composition.ts"), "utf8");
  const readiness = source.match(/export function flowProjectTabIsReady[\s\S]*?\n}/)?.[0] || "";
  assert.match(readiness, /const hasWorkspaceDirect/);
  assert.match(readiness, /flowWorkspaceTabCount === 1/);
  assert.match(readiness, /flowCustomToolTabCount === 0/);
  assert.match(readiness, /flowRuntimeToolTabCount === 0/);
  assert.match(readiness, /hasWorkspaceDirect/);
});

test("Flow workspace URL accepts a published runtime plus its base workspace", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-application-composition.ts"), "utf8");
  const workspaceUrl = source.match(/export function flowProjectWorkspaceUrl[\s\S]*?\n}/)?.[0] || "";
  assert.match(workspaceUrl, /workspaceTabs = Math\.max\(0, projectTabs - customToolTabs\)/);
  assert.match(workspaceUrl, /runtimeTabs === 1 && workspaceTabs >= 1/);
  assert.match(workspaceUrl, /candidates\.length !== 1/);
});
