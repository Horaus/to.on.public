let path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id;

function createMediaServer(dependencies) {
  ({ path, fs, app, Readable, execFileSync, dataRoot, MEDIA_SERVER_PORT, getState, collectVideoDurationMismatches, reconcileVideoResultState, logProductionTransitions, now, id } = dependencies);
  return { mediaMimeType, cacheControlForMedia, isPathInside, serveStudioMedia, toStudioMediaUrl, localPathFromStudioMediaUrl };
}

function mediaMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function cacheControlForMedia(filePath) {
  const mimeType = mediaMimeType(filePath);
  if (mimeType.startsWith("image/")) return "public, max-age=31536000, immutable";
  return "no-store";
}

function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function mediaHeaders(filePath) {
  return {
    "Accept-Ranges": "bytes",
    "Content-Type": mediaMimeType(filePath),
    "Cache-Control": cacheControlForMedia(filePath),
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin"
  };
}

function serveMediaRange(resolved, stat, headers, range) {
  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (match) {
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
      const cappedEnd = Math.min(end, stat.size - 1);
      const chunkSize = cappedEnd - start + 1;
      return new Response(Readable.toWeb(fs.createReadStream(resolved, { start, end: cappedEnd })), {
        status: 206,
        headers: { ...headers, "Content-Length": String(chunkSize), "Content-Range": `bytes ${start}-${cappedEnd}/${stat.size}` }
      });
    }
  }
  return new Response("Range Not Satisfiable", { status: 416, headers: { ...headers, "Content-Range": `bytes */${stat.size}` } });
}

function serveMediaFile(resolved, stat, headers) {
  return new Response(Readable.toWeb(fs.createReadStream(resolved)), {
    status: 200,
    headers: { ...headers, "Content-Length": String(stat.size) }
  });
}

function serveStudioMedia(request) {
  try {
    let filePath = decodeURIComponent(new URL(request.url).pathname);
    if (process.platform === "win32" && filePath.startsWith("/")) filePath = filePath.slice(1);

    const resolved = path.resolve(filePath);
    if (!isPathInside(resolved, dataRoot) && !isPathInside(resolved, app.getPath("downloads"))) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!fs.existsSync(resolved)) return new Response("Not Found", { status: 404 });

    const stat = fs.statSync(resolved);
    const headers = mediaHeaders(resolved);
    const range = request.headers.get("range");
    return range ? serveMediaRange(resolved, stat, headers, range) : serveMediaFile(resolved, stat, headers);
  } catch (err) {
    return new Response(`Not Found: ${err?.message || err}`, { status: 404 });
  }
}

function toStudioMediaUrl(filePath) {
  return `http://127.0.0.1:${MEDIA_SERVER_PORT}/media/${encodeURIComponent(filePath)}`;
}

function localPathFromStudioMediaUrl(filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  if (filePath.startsWith(`http://127.0.0.1:${MEDIA_SERVER_PORT}/media/`)) {
    try {
      return decodeURIComponent(new URL(filePath).pathname.slice("/media/".length));
    } catch {
      return "";
    }
  }
  if (filePath.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(filePath).pathname);
    } catch {
      return filePath.slice("file://".length);
    }
  }
  return filePath;
}

module.exports = { createMediaServer };
