import { defineConfig } from "vite";
import path from "node:path";

const entries: Record<string, string> = {
  chatgpt: path.resolve(__dirname, "../../packages/extension-providers/src/chatgpt/content.ts"),
  "flow-slate-bridge": path.resolve(__dirname, "../../packages/extension-providers/src/google-flow/slate-bridge.ts"),
  "google-flow": path.resolve(__dirname, "../../packages/extension-providers/src/google-flow/content.ts"),
  grok: path.resolve(__dirname, "../../packages/extension-providers/src/grok/content.ts"),
  "elevenlabs-flows": path.resolve(__dirname, "../../packages/extension-providers/src/elevenlabs-flows/content.ts")
};

const entryName = String(process.env.EXTENSION_CONTENT_ENTRY || "").trim();
if (!entryName || !entries[entryName]) throw new Error(`Unknown EXTENSION_CONTENT_ENTRY: ${entryName || "(missing)"}`);

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    target: "chrome120",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: { [`content/${entryName}`]: entries[entryName] },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
        inlineDynamicImports: true
      }
    }
  },
  resolve: {
    alias: [
      { find: /^@studio\/domain\/duration-policy$/, replacement: path.resolve(__dirname, "../../packages/domain/src/duration-policy.ts") },
      { find: /^@studio\/domain\/conversation-url$/, replacement: path.resolve(__dirname, "../../packages/domain/src/conversation-url.cjs") },
      { find: "@studio/types", replacement: path.resolve(__dirname, "../../packages/types/src/index.ts") },
      { find: "@studio/protocol", replacement: path.resolve(__dirname, "../../packages/protocol/src/index.ts") }
    ]
  }
});
