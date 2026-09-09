const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadOrCreatePairingSecret } = require("../main/bridge/pairing-secret.cjs");

function safeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, "")
  };
}

test("pairing secret is created atomically and restored from safe storage", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-pairing-secret-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "settings", "bridge-pairing-secret");
  const first = loadOrCreatePairingSecret({ fs, path, filePath, safeStorage: safeStorage(), randomBytes: () => Buffer.alloc(32, 9) });
  assert.equal(first.created, true);
  assert.match(first.secret, /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.deepEqual(loadOrCreatePairingSecret({ fs, path, filePath, safeStorage: safeStorage() }), { secret: first.secret, available: true, created: false });
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)).filter((name) => name.includes(".tmp-")), []);
});

test("pairing secret fails closed when secure storage is unavailable or file is corrupt", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-pairing-secret-invalid-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "secret");
  assert.deepEqual(loadOrCreatePairingSecret({ fs, path, filePath, safeStorage: { isEncryptionAvailable: () => false } }), { secret: "", available: false, reason: "secure_storage_unavailable" });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "not-encrypted");
  assert.deepEqual(loadOrCreatePairingSecret({ fs, path, filePath, safeStorage: safeStorage() }), { secret: "", available: true, reason: "invalid_secret_file" });
});
