const { hostnameMatches } = require("./base.cjs");

module.exports = {
  provider: "google-flow",
  // Project/tool routes are account- and session-specific. Keep the catalog
  // target at the stable signed-in workspace; dispatch only proceeds when a
  // real Studio Shot Bridge tool tab is present.
  targetUrl: "https://labs.google/fx/vi/tools/flow",
  contentScript: "content/google-flow.js",
  mainWorldScript: "content/flow-slate-bridge.js",
  matchesTab: (value) => hostnameMatches(value, (url) => ["labs.google", "labs.google.com", "flow.google.com"].includes(url.hostname))
};
