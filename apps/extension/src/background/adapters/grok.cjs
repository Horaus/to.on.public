const { hostnameMatches } = require("./base.cjs");

module.exports = {
  provider: "grok",
  targetUrl: "https://grok.com/imagine",
  contentScript: "content/grok.js",
  matchesTab: (value) => hostnameMatches(value, (url) => url.hostname === "grok.com" || (url.hostname === "x.com" && url.pathname.startsWith("/i/grok")))
};
