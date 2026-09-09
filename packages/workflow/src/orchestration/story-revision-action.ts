import { getWorkflowBridge } from "../workflow-bridge";
import type { RunJobRequest } from "@studio/types/job-request";
import type { AutomationJob, BrowserProviderAdapter, Character, Project, ProjectIntake, StudioState, VisualReference } from "@studio/types";
import { makeId } from "@studio/domain/identifiers";
import { buildStoryFoundationPrompt } from "@studio/workflow/story-foundation-prompts";
import type { SkillDoc } from "@studio/workflow/studio-types";
import { formatLabel } from "@studio/domain/labels";

type StoryRevisionDependencies = {
  character: Character;
  intake: ProjectIntake;
  lockedProjectReferences: VisualReference[];
  productionLanguage: string;
  productionProjectReferences: VisualReference[];
  project: Project;
  replaceState: (state: StudioState) => void;
  selectedVideoSkill?: SkillDoc;
  setGeneratedStorySeed: (value: string) => void;
  skills: SkillDoc[];
  state: StudioState;
  storySeed: string;
  textProvider: BrowserProviderAdapter;
};

type RunJobPayload = {
  jobId: string; projectId: string; providerId: string; jobType: AutomationJob["jobType"];
  prompt: string; bridgeMessage: RunJobRequest;
};

function latestRevisionConversation(jobs: AutomationJob[], projectId: string, providerId: string, sessionKey: string) {
  return jobs.filter((job) => {
    const message = (job.input as RunJobPayload | undefined)?.bridgeMessage;
    return job.projectId === projectId && job.providerId === providerId && job.providerConversationUrl?.startsWith("https://chatgpt.com/c/") && message?.settings?.sessionKey === sessionKey;
  }).sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0]?.providerConversationUrl;
}

export function createStoryRevisionAction(deps: StoryRevisionDependencies) {
  return function rewriteStoryWithAi() {
const { character, intake, lockedProjectReferences, productionLanguage, productionProjectReferences, project, replaceState, selectedVideoSkill, setGeneratedStorySeed, skills, state, storySeed, textProvider } = deps;
    if (!project.storyDocument) return;
    const focusedInstructions = (project.storyDocument.comments ?? []).map((item, index) =>
      `${index + 1}. ${item.section}: "${item.quote}"\nRequested change: ${item.comment}`
    ).join("\n\n");
    const characterConstraints = [
      `Active character profile: ${character.name} — ${character.role}. ${character.visualDescription || ""} ${character.outfit || ""} ${character.personality || ""} ${character.consistencyNotes || ""}`.trim(),
      ...productionProjectReferences.filter((item) => item.role === "main_character" || item.role === "supporting_character")
        .map((item) => `${item.name}: ${formatLabel(item.role)} / ${formatLabel(item.referenceUse || "supporting_detail")}${item.characterSlot ? ` / story slot ${item.characterSlot}` : ""}. ${item.sourceDescription} ${item.transformationRequest}`)
    ].filter(Boolean).join("\n");
    const prompt = `${buildStoryFoundationPrompt(storySeed, intake, productionProjectReferences, selectedVideoSkill, skills.find((skill) => skill.id === "script-adaptation"), skills.find((skill) => skill.id === "narrative-performance"))}

REVISION MODE:
Revise the existing package below. Change only passages required by the comments or manual edits. Preserve all unaffected facts, scene order, continuity constraints, character identity, and approved creative decisions.
If the revision was triggered by Character & Style changes, integrate the character constraints into the existing story with the smallest possible narrative change. Do not create a new unrelated premise.

CHARACTER CONSTRAINTS TO INTEGRATE:
${characterConstraints || "No character changes supplied."}

CURRENT LOCKED ARCHITECTURE PACKAGE:
${JSON.stringify({ sourceAnalysis: project.storyDocument.sourceAnalysis, adaptationDecisions: project.storyDocument.adaptationDecisions, narrativeContract: project.storyDocument.narrativeContract, story: project.storyDocument.story, scenes: project.storyDocument.scenes, screenplayScenes: project.storyDocument.screenplayScenes }, null, 2)}

FOCUSED REVISION NOTES:
${focusedInstructions || "The user manually edited the document. Reconcile those edits while preserving unaffected content."}`;
    const jobId = makeId("story");
    const sessionKey = `${project.id}:story-architecture`;
    const conversationUrl = latestRevisionConversation(state.jobs, project.id, textProvider.id, sessionKey);
    setGeneratedStorySeed(storySeed);
    const payload: RunJobPayload = {
      jobId, projectId: project.id, providerId: textProvider.id, jobType: "text", prompt,
      bridgeMessage: {
        type: "RUN_JOB", jobId, provider: textProvider.platform, task: "story_foundation", prompt, conversationUrl,
        references: lockedProjectReferences.map((item) => ({ assetId: item.id, filePath: item.filePath })),
        settings: { aspectRatio: intake.videoFrame?.aspectRatio || "16:9", durationSec: 4, quality: "balanced", newConversation: !conversationUrl, sessionKey, outputLanguage: productionLanguage, screenplaySchemaVersion: 3 },
        download: { auto: false, targetFolder: `/data/projects/${project.id}/story`, filenameTemplate: "story-revision" }
      }
    };
    getWorkflowBridge()?.runJob(payload).then(replaceState);
  };
}
