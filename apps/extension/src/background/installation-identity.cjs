const STORAGE_KEY = "studio.extensionInstanceId.v1";

async function loadOrCreateInstallationId(storage, randomUUID = () => crypto.randomUUID()) {
  const stored = await storage.get(STORAGE_KEY);
  const existing = typeof stored?.[STORAGE_KEY] === "string" ? stored[STORAGE_KEY].trim() : "";
  if (existing) return existing;
  const generated = String(randomUUID()).trim();
  if (!generated) throw new Error("Extension installation identity generator returned an empty value.");
  await storage.set({ [STORAGE_KEY]: generated });
  return generated;
}

module.exports = { STORAGE_KEY, loadOrCreateInstallationId };
