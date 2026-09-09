const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function loadPolicy(suffix) {
  const source = path.resolve(__dirname, "../background/asset-downloader.ts");
  return (await import(`${pathToFileURL(source).href}?allowlist-${suffix}#${Date.now()}`)).isAllowedProviderAssetUrl;
}

async function loadBinaryValidator(suffix) {
  const source = path.resolve(__dirname, "../background/asset-downloader.ts");
  return (await import(`${pathToFileURL(source).href}?binary-${suffix}#${Date.now()}`)).validateDownloadedBinary;
}

async function loadStreamReader(suffix) {
  const source = path.resolve(__dirname, "../background/asset-downloader.ts");
  return (await import(`${pathToFileURL(source).href}?stream-${suffix}#${Date.now()}`)).readResponseBytes;
}

test("provider asset URL allowlist accepts known media hosts and rejects lookalikes", async () => {
  const isAllowed = await loadPolicy("known");
  assert.equal(isAllowed("https://storage.googleapis.com/flow/result.mp4", "google-flow"), true);
  assert.equal(isAllowed("https://lh3.googleusercontent.com/result.mp4", "google-flow"), true);
  assert.equal(isAllowed("https://files.oaiusercontent.com/result.png", "chatgpt"), true);
  assert.equal(isAllowed("https://googleapis.com.evil.invalid/result.mp4", "google-flow"), false);
  assert.equal(isAllowed("blob:https://labs.google/fake-session/result.mp4", "google-flow"), true);
  assert.equal(isAllowed("blob:https://evil.invalid/fake-session/result.mp4", "google-flow"), false);
  assert.equal(isAllowed("http://127.0.0.1:3768/media/result.mp4", "google-flow"), true);
  assert.equal(isAllowed("javascript:alert(1)", "google-flow"), false);
});

test("provider asset URL allowlist is provider-scoped", async () => {
  const isAllowed = await loadPolicy("scoped");
  assert.equal(isAllowed("https://files.oaiusercontent.com/result.png", "google-flow"), false);
  assert.equal(isAllowed("https://storage.googleapis.com/result.mp4", "chatgpt"), false);
  assert.equal(isAllowed("https://cdn.elevenlabs.io/result.mp3", "elevenlabs-flows"), true);
});

test("downloader rejects an unallowlisted provider URL before invoking browser I/O", async () => {
  const source = path.resolve(__dirname, "../background/asset-downloader.ts");
  const { createAssetDownloader } = await import(`${pathToFileURL(source).href}?download-guard=${Date.now()}`);
  const downloader = createAssetDownloader();
  await assert.rejects(
    downloader.downloadAsset(
      { type: "video", filePath: "https://evil.invalid/result.mp4" },
      { jobId: "job-1", provider: "google-flow", task: "image_to_video", prompt: "", tabId: 1, references: [], settings: {}, download: { auto: true, filenameTemplate: "result" } }
    ),
    /MEDIA_REDIRECT_NOT_ALLOWED/
  );
});

test("downloaded binary validation rejects HTML, wrong MIME and oversized media", async () => {
  const validate = await loadBinaryValidator("rejects");
  const mp4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
  assert.deepEqual(validate({ bytes: Uint8Array.from([0x3c, 0x68, 0x74, 0x6d]), mimeType: "text/html", assetType: "video" }), { ok: false, code: "invalid_media_signature" });
  assert.deepEqual(validate({ bytes: mp4, mimeType: "image/png", assetType: "video" }), { ok: false, code: "media_type_mismatch" });
  assert.deepEqual(validate({ bytes: { byteLength: 200 * 1024 * 1024 + 1 }, mimeType: "video/mp4", assetType: "video" }), { ok: false, code: "media_too_large" });
});

test("downloaded binary validation accepts a signed container with octet-stream MIME", async () => {
  const validate = await loadBinaryValidator("accepts");
  const mp4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assert.deepEqual(validate({ bytes: mp4, mimeType: "application/octet-stream", assetType: "video" }), {
    ok: true,
    byteSize: mp4.byteLength,
    mimeType: "application/octet-stream"
  });
});

test("response stream reader accepts chunked media without content-length", async () => {
  const readResponseBytes = await loadStreamReader("accepts");
  const chunks = [Uint8Array.from([0, 0]), Uint8Array.from([0x66, 0x74, 0x79, 0x70])];
  let index = 0;
  const bytes = await readResponseBytes({
    body: { getReader: () => ({ read: async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined }, releaseLock() {} }) },
    arrayBuffer: async () => new ArrayBuffer(0)
  }, 8);
  assert.deepEqual(Array.from(bytes || []), [0, 0, 0x66, 0x74, 0x79, 0x70]);
});

test("response stream reader cancels and rejects an oversized body", async () => {
  const readResponseBytes = await loadStreamReader("caps");
  let cancelled = "";
  const result = await readResponseBytes({
    body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array([1, 2, 3]) }), cancel: async (reason) => { cancelled = String(reason); }, releaseLock() {} }) },
    arrayBuffer: async () => new ArrayBuffer(0)
  }, 2);
  assert.equal(result, null);
  assert.equal(cancelled, "media_too_large");
});
