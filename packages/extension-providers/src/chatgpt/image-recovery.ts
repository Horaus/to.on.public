export type ChatGptImageCandidate = { src: string; alt: string; fileId: string };

export function finalizeImageRecovery(input: {
  jobId: string;
  candidates: ChatGptImageCandidate[];
  providerError: string | null;
  turn: HTMLElement | null | undefined;
  markerExists: boolean;
  isGenerating: (scope?: ParentNode) => boolean;
  reportStatus: (jobId: string, status: string, message: string) => void;
  reportResult: (jobId: string, status: string, assets?: Array<Record<string, unknown>>, error?: string) => void;
  reportRecoveredImage: (jobId: string, candidate: ChatGptImageCandidate) => void;
}): void {
  const { jobId, candidates, providerError, turn, markerExists, isGenerating, reportStatus, reportResult, reportRecoveredImage } = input;
  if ([candidates.length === 0, providerError, turn, turn && !isGenerating(turn)].every(Boolean)) {
    reportResult(jobId, "failed_retryable", undefined, `${providerError}: ${(turn!.innerText || "").slice(0, 400)}`);
    return;
  }
  if (candidates.length === 0) {
    if ((turn && isGenerating(turn)) || isGenerating()) { reportStatus(jobId, "generating", "Matching ChatGPT response found; waiting for the image to finish."); return; }
    reportStatus(jobId, "waiting_manual_action", markerExists ? "The matching response is open, but its generated image is not mounted yet. Keep this chat visible." : "The saved conversation is open, but its request marker is not mounted yet. Recovery will keep checking this exact URL.");
    return;
  }
  reportRecoveredImage(jobId, candidates[0]);
}

export function recoveredImageAsset(jobId: string, candidate: ChatGptImageCandidate, conversationUrl: string): Array<Record<string, unknown>> {
  return [{ type: "image", filename: `chatgpt_${jobId}_recovered.png`, downloadPath: candidate.src, mimeType: "image/png", metadata: { altPrompt: candidate.alt.replace(/^Generated image:\s*/i, ""), fileId: candidate.fileId, conversationUrl, recovered: true } }];
}
