export function flowPageErrorText(input: { href: string; title: string; bodyText: string; crash: (value: string) => string | null; chrome: (value: string) => string | null; auth: (value: string, href: string) => string | null }): string | null {
  const value = `${input.href} ${input.title} ${input.bodyText}`.replace(/\s+/g, " ").trim();
  return input.crash(value) || input.chrome(value) || input.auth(value, input.href);
}

export function flowDebugSnapshot(input: { pageError: string | null; pathname: string; title: string; buttons: string[]; panels: string[]; fileInputs: string[]; promptInfo: string }): string {
  return `url=${input.pathname}; title=${input.title}; pageError=${input.pageError || "none"}; prompt=${input.promptInfo}; buttons=[${input.buttons.join(" | ")}]; panels=[${input.panels.join(" || ")}]; fileInputs=[${input.fileInputs.join(", ")}]`;
}
