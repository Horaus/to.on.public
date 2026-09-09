function isSavedChatGptConversationUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://chatgpt.com" && /^\/c\/(?!WEB:)[^/]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

module.exports = { isSavedChatGptConversationUrl };
