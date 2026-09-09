const providerCatalog = [
  { id: "chatgpt-web", name: "ChatGPT", platform: "chatgpt", capabilities: ["text", "image", "prompt-enhance"], targetUrl: "https://chatgpt.com/", safetyNotes: ["Requires the user to be logged in.", "Stops at captcha, quota, or payment prompts."] },
  // Gemini text routing is available in the desktop catalog, but the browser
  // extension has no Gemini image adapter yet. Do not advertise image support
  // until a real dispatch/result adapter exists; otherwise a selected image
  // job can remain pending forever waiting for an extension lane that cannot
  // consume it.
  { id: "gemini-web", name: "Gemini", platform: "gemini", capabilities: ["text", "prompt-enhance"], targetUrl: "https://gemini.google.com/app", safetyNotes: ["Requires a signed-in Google account.", "Image generation is not available through the current browser adapter."] },
  { id: "grok-web", name: "Grok", platform: "grok", capabilities: ["text", "image", "video"], targetUrl: "https://grok.com/imagine", safetyNotes: ["Feature availability depends on the signed-in account."] },
  { id: "deepseek-web", name: "DeepSeek", platform: "deepseek", capabilities: ["text"], targetUrl: "https://chat.deepseek.com/", safetyNotes: ["Requires a signed-in account."] },
  { id: "google-flow-web", name: "Flow", platform: "google-flow", capabilities: ["image", "video"], targetUrl: "https://labs.google/fx/vi/tools/flow", safetyNotes: ["Requires a valid Flow session.", "Manual action is surfaced instead of bypassed."] },
  { id: "elevenlabs-flows-web", name: "ElevenLabs Flows", platform: "elevenlabs-flows", capabilities: ["image", "video", "audio", "flow"], targetUrl: "https://elevenlabs.io/app/flows/", safetyNotes: ["Requires an open signed-in flow.", "Runs only an explicitly identified or unambiguous prewired generation node."] }
];

function providerSupports(providerId, capability) {
  return providerCatalog.some((provider) => provider.id === providerId && provider.capabilities.includes(capability));
}

function sanitizeProjectRouting(project) {
  const defaults = { textProvider: "chatgpt-web", imageProvider: "chatgpt-web", videoProvider: "google-flow-web" };
  // Older renderer patches occasionally persisted a scalar (for example the
  // quality string `balanced`) in the routing slot. Spreading that scalar
  // later creates numeric character keys and silently breaks provider
  // admission. Normalize the shape at the persistence boundary and retain
  // only the three executable provider lanes.
  const current = project.intake?.aiRouting;
  const routing = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  project.intake.aiRouting = {
    textProvider: providerSupports(routing.textProvider, "text") ? routing.textProvider : defaults.textProvider,
    imageProvider: providerSupports(routing.imageProvider, "image") ? routing.imageProvider : defaults.imageProvider,
    videoProvider: providerSupports(routing.videoProvider, "video") ? routing.videoProvider : defaults.videoProvider
  };
  // Preserve an explicit project mode so the Relay can expose both supported
  // Flow paths. Unknown/legacy values fail closed to the frame-keyframe path.
  if (!["frames", "components"].includes(String(project.intake.flowVideoMode || ""))) project.intake.flowVideoMode = "frames";
}

module.exports = { providerCatalog, providerSupports, sanitizeProjectRouting };
