import { useStudioApplicationContext } from "./studio-application-context";
import { GenerateScreen } from "./screens/generate-screen";
import { AssetsScreen, OverviewScreen, SourceScreen, StoryScreen } from "./studio-narrative-screens";
import { ReviewScreen } from "./screens/review-screen";
import { StoryboardScreen } from "./screens/storyboard-screen";
import { ProductionGraphView } from "./views/production-graph-view";

/** Routes the active production view without coupling the application shell to every screen. */
export function StudioContent() {
  const model = useStudioApplicationContext();
  const currentScreen = (() => {
    switch (model.activeView) {
      case "overview": return <OverviewScreen />;
      case "flow": return <ProductionGraphView graph={model.productionGraph} issueCount={model.productionGraphIssues.length} project={model.project} providers={model.state.providers} scenes={model.projectScenes} shots={model.projectShots} characters={model.projectCharacters} assets={model.projectAssets} jobs={model.state.jobs.filter((job) => job.projectId === model.project.id)} references={model.productionProjectReferences} revisions={model.project.productionGraphRevisions ?? {}} onUpdateProject={model.updateProjectPatch} onUpdateIntake={model.updateIntake} onUpdateScene={model.updateScene} onUpdateShot={model.updateShot} onOpenDocument={model.openFlowDocument} onGenerateRevision={model.generateProductionGraphRevision} onRestoreTextVersion={model.restoreProductionGraphTextVersion} onRegenerateMedia={model.regenerateProductionMedia} onAddCustomNode={model.addProductionGraphNode} onUpdateCustomNode={model.updateProductionGraphNode} onDeleteCustomNode={model.deleteProductionGraphNode} onGenerateCustomImage={model.generateProductionGraphImage} />;
      case "story": return <StoryScreen />;
      case "assets": return <AssetsScreen />;
      case "source": return <SourceScreen />;
      case "storyboard": return <StoryboardScreen />;
      case "generate": return <GenerateScreen />;
      case "review": return <ReviewScreen />;
    }
  })();
  return <div className="content-scroll">{currentScreen}</div>;
}
