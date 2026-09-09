import type { Project } from "@studio/types";
import type { ReactNode } from "react";
import type { CanvasDocument, CanvasGroupSpec, CanvasNodeData, FlowDocument, GroupNodeData, ImageGeneratorCanvasDocument, SectionNodeData } from "@studio/types";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes, Check,
  ChevronRight,
  FolderKanban,
  LayoutGrid,
  MonitorCheck,
  Sparkles
} from "lucide-react";
import { createTranslator } from "@studio/renderer-core/i18n";

type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";


export function PhaseList({ status, onOpen, t, compact = false }: { status: boolean[]; onOpen: (view: StudioView) => void; t: ReturnType<typeof createTranslator>; compact?: boolean }) {
  const phases: Array<{ title: string; detail: string; view: StudioView; icon: LucideIcon }> = [
    { title: t("phase.planStory"), detail: t("phase.planStoryDetail"), view: "story", icon: BookOpen },
    { title: t("phase.lockIdentity"), detail: t("phase.lockIdentityDetail"), view: "assets", icon: Boxes },
    { title: t("phase.directStoryboard"), detail: t("phase.directStoryboardDetail"), view: "storyboard", icon: LayoutGrid },
    { title: t("phase.generateBrowser"), detail: t("phase.generateBrowserDetail"), view: "generate", icon: Sparkles },
    { title: t("phase.reviewContinuity"), detail: t("phase.reviewContinuityDetail"), view: "review", icon: MonitorCheck }
  ];
  return (
    <div className={`phase-list ${compact ? "compact" : ""}`}>
      {phases.map((phase, index) => (
        <button type="button" key={phase.view} className={status[index] ? "complete" : index === status.findIndex((item) => !item) ? "current" : ""} onClick={() => onOpen(phase.view)}>
          <span className="phase-icon">{status[index] ? <Check size={16} /> : <phase.icon size={17} />}</span>
          <span><strong>{phase.title}</strong><small>{phase.detail}</small></span>
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
}

export function Metric({ label, value }: { label: ReactNode; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
