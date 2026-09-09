import type { ProductionFormat, SourceMaterialType } from "@studio/types";

export const sourceRules: Record<SourceMaterialType, string> = {
  idea: "Expand the premise into a complete narrative. You may invent missing connective events, but preserve the user's core intent.",
  novel: "Adapt the supplied prose chronologically. Preserve causality, character motivation, key dialogue, and essential plot events; compress internal narration into visible action.",
  screenplay: "Treat the input as an existing screenplay. Preserve scene order, dialogue intent, and dramatic beats; normalize it into the required production schema without rewriting the premise."
};

export const formatRules: Record<ProductionFormat, string> = {
  short_film: "Build a self-contained cinematic arc with setup, escalation, climax, and resolution. Prioritize emotional continuity over speed.",
  short_video: "The first provider-sized shot must open immediately on a visual or verbal hook. Use rapid information density, one central idea, and a strong final payoff or loop.",
  video_series: "Design an episodic arc. Each episode needs its own hook and payoff while preserving unresolved threads, character rules, locations, props, and visual continuity across episodes."
};

export const platformOptions = ["YouTube", "YouTube Shorts", "TikTok", "Reels"];
