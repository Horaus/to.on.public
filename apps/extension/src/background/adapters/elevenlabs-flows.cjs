const { hostnameMatches } = require("./base.cjs");

module.exports = {
  provider: "elevenlabs-flows",
  targetUrl: "https://elevenlabs.io/app/flows/",
  contentScript: "content/elevenlabs-flows.js",
  matchesTab: (value) => hostnameMatches(value, (url) => url.hostname === "elevenlabs.io" && url.pathname.startsWith("/app/flows/"))
};
