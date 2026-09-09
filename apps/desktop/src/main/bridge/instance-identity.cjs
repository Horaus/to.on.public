function loadOrCreateInstanceId({ fs, path, filePath, randomUUID }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    const existing = String(fs.readFileSync(filePath, "utf8") || "").trim();
    if (existing) return existing;
  }
  const generated = String(randomUUID()).trim();
  if (!generated) throw new Error("Desktop instance identity generator returned an empty value.");
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, `${generated}\n`, { mode: 0o600 });
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try {
      if (typeof fs.rmSync === "function") fs.rmSync(temporary, { force: true });
      else if (typeof fs.unlinkSync === "function") fs.unlinkSync(temporary);
    } catch { /* preserve the original identity error */ }
    throw error;
  }
  return generated;
}

module.exports = { loadOrCreateInstanceId };
