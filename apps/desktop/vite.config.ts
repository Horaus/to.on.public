import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const devPort = Number.parseInt(process.env.STUDIO_DEV_PORT || "5273", 10);

export default defineConfig({
  root: "apps/desktop",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@studio\/domain\/pipeline-gates$/, replacement: path.resolve(__dirname, "../../packages/domain/src/pipeline-gates.ts") },
      { find: /^@studio\/domain\/shot-classification$/, replacement: path.resolve(__dirname, "../../packages/domain/src/shot-classification.ts") },
      { find: /^@studio\/domain\/text-support$/, replacement: path.resolve(__dirname, "../../packages/domain/src/text-support.ts") },
      { find: /^@studio\/domain\/labels$/, replacement: path.resolve(__dirname, "../../packages/domain/src/labels.ts") },
      { find: /^@studio\/domain\/layout$/, replacement: path.resolve(__dirname, "../../packages/domain/src/layout.ts") },
      { find: /^@studio\/domain\/identifiers$/, replacement: path.resolve(__dirname, "../../packages/domain/src/identifiers.ts") },
      { find: /^@studio\/domain\/preflight-contract$/, replacement: path.resolve(__dirname, "../../packages/domain/src/preflight-contract.ts") },
      { find: /^@studio\/domain\/job-contracts$/, replacement: path.resolve(__dirname, "../../packages/domain/src/job-contracts.ts") },
      { find: /^@studio\/domain\/duration-policy$/, replacement: path.resolve(__dirname, "../../packages/domain/src/duration-policy.ts") },
      { find: /^@studio\/protocol\/job-request$/, replacement: path.resolve(__dirname, "../../packages/protocol/src/job-request.ts") },
      { find: /^@studio\/production-graph\/contracts$/, replacement: path.resolve(__dirname, "../../packages/production-graph/src/contracts.ts") },
      { find: /^@studio\/workflow\/(.+)$/, replacement: path.resolve(__dirname, "../../packages/workflow/src/$1.ts") },
      { find: /^@studio\/renderer-core\/(.+)$/, replacement: path.resolve(__dirname, "../../packages/renderer/src/core/$1.ts") },
      { find: "@studio/types", replacement: path.resolve(__dirname, "../../packages/types/src/index.ts") },
      { find: "@studio/protocol", replacement: path.resolve(__dirname, "../../packages/protocol/src/index.ts") },
      { find: "@studio/domain", replacement: path.resolve(__dirname, "../../packages/domain/src/index.ts") },
      { find: "@studio/production-graph", replacement: path.resolve(__dirname, "../../packages/production-graph/src/index.ts") }
    ]
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react-flow", test: /node_modules\/@xyflow/ },
            { name: "icons", test: /node_modules\/lucide-react/ },
            { name: "react-vendor", test: /node_modules\/(react|react-dom|scheduler)\// },
            { name: "renderer-screens", test: /packages\/renderer\/src\/screens\// },
            { name: "renderer-views", test: /packages\/renderer\/src\/views\// }
          ]
        }
      }
    }
  },
  server: {
    port: devPort,
    strictPort: true
  }
});
