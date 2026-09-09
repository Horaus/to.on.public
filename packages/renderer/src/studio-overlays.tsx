import { useStudioApplicationContext } from "./studio-application-context";
import { UploadPreviewOverlay } from "./overlays/preview-upload";
import { ProjectManagerOverlay } from "./overlays/project-manager-open";
import { ReferenceEditorOverlay } from "./overlays/selected-reference";
import { AppManagerOverlay } from "./overlays/app-manager-account-overlay";
import { GeneratedAssetPreviewOverlay } from "./overlays/preview-generated-asset";

export function StudioOverlayStack() {
  const model = useStudioApplicationContext();
  return <>
    <ProjectManagerOverlay model={model} />
    <AppManagerOverlay model={model} />
    <ReferenceEditorOverlay model={model} />
    <UploadPreviewOverlay model={model} />
    <GeneratedAssetPreviewOverlay model={model} />
  </>;
}
