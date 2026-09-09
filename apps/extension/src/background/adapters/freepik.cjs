const { hostnameMatches } = require("./base.cjs");

module.exports = {
  provider: "freepik",
  targetUrl: "https://www.freepik.com/pikaso/ai-image-generator",
  matchesTab: (value) => hostnameMatches(value, (url) => url.hostname.endsWith("freepik.com"))
};
