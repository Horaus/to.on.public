import "@xyflow/react/dist/style.css";
import React, { Component } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioApplication } from "../../../../packages/renderer/src/studio-application";
import { StudioApplicationContext, useStudioApplicationModel } from "../../../../packages/renderer/src/studio-application-model";
import { configureWorkflowBridge } from "@studio/workflow/workflow-bridge";
import "../../../../packages/renderer/src/styles.css";

declare global {
  interface Window { __studioReactRoot?: Root; }
}

class StudioErrorBoundary extends Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Studio renderer crashed", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="studio-crash-recovery" role="alert">
      <h1>Studio cần tải lại giao diện</h1>
      <p>Dữ liệu project vẫn an toàn. Renderer gặp lỗi khi chuyển bước: {this.state.error.message}</p>
      <button type="button" aria-label="Tải lại giao diện studio" onClick={() => window.location.reload()}>Tải lại giao diện</button>
    </main>;
  }
}

function App() {
  const model = useStudioApplicationModel();
  return <StudioApplicationContext.Provider value={model}><StudioApplication /></StudioApplicationContext.Provider>;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Renderer root element is missing.");
configureWorkflowBridge(window.studioBridge);
window.__studioReactRoot ||= createRoot(rootElement);
window.__studioReactRoot.render(
  <React.StrictMode>
    <StudioErrorBoundary><App /></StudioErrorBoundary>
  </React.StrictMode>
);
