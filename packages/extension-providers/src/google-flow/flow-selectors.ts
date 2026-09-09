export const FLOW_SELECTORS = {
  promptInput: [
    'textarea[aria-label*="prompt" i]',
    'textarea[placeholder*="Describe" i]',
    'textarea[placeholder*="prompt" i]',
    '[contenteditable="true"][aria-label*="prompt" i]',
    '[contenteditable="true"]',
    ".prompt-input textarea",
    "textarea"
  ],
  fileInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
  submitButton: ['button[aria-label*="Create" i]', 'button[aria-label*="Generate" i]', 'button[type="submit"]'],
  loadingIndicator: ['[role="progressbar"]', ".loading", '[aria-busy="true"]', ".spinner"],
  resultMedia: ['video', 'video source[src]', "video[src]", 'a[href$=".mp4"]', 'img[src*="generated"]', 'img[alt*="Generated"]', 'flow-video-tile img.thumbnail', 'flow-video-tile img[alt*="video" i]'],
  workspaceHints: ['textarea', '[contenteditable="true"]', '[aria-label*="prompt" i]', '[placeholder*="prompt" i]']
};
