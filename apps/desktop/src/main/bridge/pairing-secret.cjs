const crypto = require("node:crypto");

const SECRET_BYTES = 32;

function atomicWriteSecret({ fs, path, filePath, value }) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(temporary, value, { encoding: "utf8", mode: 0o600 });
    if (typeof fs.chmodSync === "function") fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* preserve the original error */ }
    throw error;
  }
}

function loadOrCreatePairingSecret({ fs, path, filePath, safeStorage, randomBytes = crypto.randomBytes } = {}) {
  if (!safeStorage || safeStorage.isEncryptionAvailable?.() !== true) return { secret: "", available: false, reason: "secure_storage_unavailable" };
  if (fs.existsSync(filePath)) {
    try {
      const encoded = String(fs.readFileSync(filePath, "utf8") || "").trim();
      if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) return { secret: "", available: true, reason: "invalid_secret_file" };
      const secret = String(safeStorage.decryptString(Buffer.from(encoded, "base64")) || "").trim();
      if (!/^[a-f0-9]{64}$/i.test(secret)) return { secret: "", available: true, reason: "invalid_secret_file" };
      return { secret, available: true, created: false };
    } catch {
      return { secret: "", available: true, reason: "invalid_secret_file" };
    }
  }
  const secret = randomBytes(SECRET_BYTES).toString("hex");
  try {
    const encrypted = safeStorage.encryptString(secret).toString("base64");
    atomicWriteSecret({ fs, path, filePath, value: `${encrypted}\n` });
    return { secret, available: true, created: true };
  } catch {
    return { secret: "", available: true, reason: "secret_persistence_failed" };
  }
}

module.exports = { SECRET_BYTES, loadOrCreatePairingSecret };
