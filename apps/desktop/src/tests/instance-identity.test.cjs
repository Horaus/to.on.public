const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadOrCreateInstanceId } = require("../main/bridge/instance-identity.cjs");

test("desktop instance identity is stable across restarts and written atomically", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-desktop-identity-"));
  const filePath = path.join(root, "settings", "desktop-instance-id");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(loadOrCreateInstanceId({ fs, path, filePath, randomUUID: () => "desktop-a" }), "desktop-a");
  assert.equal(loadOrCreateInstanceId({ fs, path, filePath, randomUUID: () => "desktop-b" }), "desktop-a");
  assert.equal(fs.readFileSync(filePath, "utf8"), "desktop-a\n");
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)).filter((name) => name.includes(".tmp-")), []);
});

test("desktop instance identity fails closed when generation is empty", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-desktop-identity-empty-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => loadOrCreateInstanceId({ fs, path, filePath: path.join(root, "id"), randomUUID: () => "" }), /empty value/);
});
