import { getWorkflowBridge } from "../workflow-bridge";
import type { Project, StudioState } from "@studio/types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StoryDocument } from "@studio/workflow/studio-types";

type StoryDocumentActionDependencies = {
  project: Project;
  replaceState: (state: StudioState) => void;
  setState: Dispatch<SetStateAction<StudioState>>;
  storyRedoRef: MutableRefObject<StoryDocument[]>;
  storyUndoRef: MutableRefObject<StoryDocument[]>;
};

export function createStoryDocumentActions(deps: StoryDocumentActionDependencies) {
  const { project, replaceState, setState, storyRedoRef, storyUndoRef } = deps;

  function persistStoryDocument(storyDocument: StoryDocument) {
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === project.id ? { ...item, storyDocument } : item)
    }));
    getWorkflowBridge()?.updateProject(project.id, { storyDocument }).then(replaceState);
  }

  function updateStoryDocument(storyDocument: StoryDocument) {
    if (project.storyDocument) storyUndoRef.current.push(project.storyDocument);
    storyRedoRef.current = [];
    const previous = project.storyDocument;
    const changedSections = previous ? [
      ["A · câu chuyện", previous.story !== storyDocument.story],
      ["B · phân cảnh", previous.sceneBreakdown !== storyDocument.sceneBreakdown],
      ["B · screenplay", previous.screenplay !== storyDocument.screenplay],
    ].filter(([, changed]) => changed).map(([label]) => label) : [];
    persistStoryDocument({
      ...storyDocument,
      manuallyEdited: true,
      revisionNote: changedSections.length ? `Đã chỉnh sửa ${changedSections.join(" và ")}. Các bước phía sau có thể cần tạo lại.` : storyDocument.revisionNote,
      revisionAt: changedSections.length ? new Date().toISOString() : storyDocument.revisionAt
    });
  }

  function undoStoryChange() {
    const previous = storyUndoRef.current.pop();
    if (!previous || !project.storyDocument) return;
    storyRedoRef.current.push(project.storyDocument);
    persistStoryDocument(previous);
  }

  function redoStoryChange() {
    const nextDocument = storyRedoRef.current.pop();
    if (!nextDocument || !project.storyDocument) return;
    storyUndoRef.current.push(project.storyDocument);
    persistStoryDocument(nextDocument);
  }

  return { persistStoryDocument, redoStoryChange, undoStoryChange, updateStoryDocument };
}
