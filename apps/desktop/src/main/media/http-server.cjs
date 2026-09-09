const http = require("node:http");

function createMediaHttpServer(deps) {
  const { port, host = "127.0.0.1" } = deps;
  const server = http.createServer((req, res) => handleMediaHttpRequest(req, res, deps));
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Media server port ${port} is already in use. Existing media URLs may still resolve if another studio instance owns it.`);
      return;
    }
    console.warn("Media server error:", error.message || error);
  });
  server.listen(port, host);
  return server;
}

function handleMediaHttpRequest(req, res, deps) {
  const { port, fs, path, dataRoot, downloadsRoot, isPathInside, cacheControlForMedia, mediaMimeType } = deps;
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (!url.pathname.startsWith("/media/")) return endResponse(res, 404, "Not Found");
    const resolved = path.resolve(decodeURIComponent(url.pathname.slice("/media/".length)));
    if (!isPathInside(resolved, dataRoot) && !isPathInside(resolved, downloadsRoot)) return endResponse(res, 403, "Forbidden");
    if (!fs.existsSync(resolved)) return endResponse(res, 404, "Not Found");

    const stat = fs.statSync(resolved);
    const headers = {
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": cacheControlForMedia(resolved),
      "Content-Type": mediaMimeType(resolved)
    };
    if (req.headers.range) return sendRange(req, res, resolved, stat, headers, fs);
    if (req.method === "HEAD") return endResponse(res, 200, "", { ...headers, "Content-Length": String(stat.size) });
    sendStream(res, 200, { ...headers, "Content-Length": String(stat.size) }, fs.createReadStream(resolved));
  } catch (error) {
    endResponse(res, 404, `Not Found: ${error?.message || error}`);
  }
}

function sendRange(req, res, resolved, stat, headers, fs) {
  const match = String(req.headers.range).match(/bytes=(\d*)-(\d*)/);
  if (!match) return endResponse(res, 416, "Range Not Satisfiable", { ...headers, "Content-Range": `bytes */${stat.size}` });
  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
    return endResponse(res, 416, "Range Not Satisfiable", { ...headers, "Content-Range": `bytes */${stat.size}` });
  }
  const cappedEnd = Math.min(end, stat.size - 1);
  const rangeHeaders = {
    ...headers,
    "Content-Length": String(cappedEnd - start + 1),
    "Content-Range": `bytes ${start}-${cappedEnd}/${stat.size}`
  };
  if (req.method === "HEAD") return endResponse(res, 206, "", rangeHeaders);
  sendStream(res, 206, rangeHeaders, fs.createReadStream(resolved, { start, end: cappedEnd }));
}

function endResponse(res, status, body, headers = { "Content-Type": "text/plain" }) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendStream(res, status, headers, stream) {
  res.writeHead(status, headers);
  stream.pipe(res);
}

module.exports = { createMediaHttpServer, handleMediaHttpRequest };
