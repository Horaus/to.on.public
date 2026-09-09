const { hostnameMatches } = require("./base.cjs");

module.exports = {
  provider: "chatgpt",
  targetUrl: "https://chatgpt.com/",
  contentScript: "content/chatgpt.js",
  matchesTab: (value) => hostnameMatches(value, (url) => ["chatgpt.com", "chat.openai.com"].includes(url.hostname))
};
