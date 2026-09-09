import { useEffect } from "react";
import type { StudioView } from "@studio/workflow/studio-types";

type KeyboardShortcutDeps = {
  activeView: StudioView;
  appManagerOpen: boolean;
  projectManagerOpen: boolean;
  storyJobActive: boolean;
  setAppManagerTab: (tab: "settings" | "projects" | "account") => void;
  setAppManagerOpen: (open: boolean) => void;
  setProjectManagerOpen: (open: boolean) => void;
  developStory: () => void;
  redoStoryChange: () => void;
  undoStoryChange: () => void;
};

export function useStudioKeyboardShortcuts({
  activeView, appManagerOpen, projectManagerOpen, storyJobActive,
  setAppManagerTab, setAppManagerOpen, setProjectManagerOpen,
  developStory, redoStoryChange, undoStoryChange
}: KeyboardShortcutDeps): void {
  useEffect(() => {
    const deps = { activeView, appManagerOpen, projectManagerOpen, storyJobActive, setAppManagerTab, setAppManagerOpen, setProjectManagerOpen, developStory, redoStoryChange, undoStoryChange };
    const handleShortcut = (event: KeyboardEvent) => handleStudioShortcut(event, deps);
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeView, appManagerOpen, projectManagerOpen, storyJobActive, setAppManagerTab, setAppManagerOpen, setProjectManagerOpen, developStory, redoStoryChange, undoStoryChange]);
}

function handleStudioShortcut(event: KeyboardEvent, deps: KeyboardShortcutDeps): void {
  const isTextField = Boolean((event.target as HTMLElement | null)?.matches("input, textarea, [contenteditable=true]"));
  if (event.metaKey || event.ctrlKey) {
    handleModifiedStudioShortcut(event, { ...deps, isTextField });
    return;
  }
  if (event.key === "Escape") closeStudioShortcutOwner(deps);
}

function handleModifiedStudioShortcut(event: KeyboardEvent, deps: KeyboardShortcutDeps & { isTextField: boolean }): void {
  if (event.key === ",") {
    event.preventDefault();
    deps.setAppManagerTab("settings");
    deps.setAppManagerOpen(true);
    return;
  }
  if (event.key.toLowerCase() === "s") {
    const saveButton = document.querySelector<HTMLButtonElement>('[title="Save changes"]');
    if (saveButton) { event.preventDefault(); saveButton.click(); }
    return;
  }
  if (event.key.toLowerCase() === "z" && !deps.isTextField) {
    event.preventDefault();
    if (event.shiftKey) deps.redoStoryChange(); else deps.undoStoryChange();
    return;
  }
  if (event.key === "Enter" && deps.activeView === "story" && !deps.isTextField && !deps.storyJobActive) {
    event.preventDefault();
    deps.developStory();
  }
}

function closeStudioShortcutOwner(deps: KeyboardShortcutDeps): void {
  if (deps.appManagerOpen) deps.setAppManagerOpen(false);
  else if (deps.projectManagerOpen) deps.setProjectManagerOpen(false);
}
