import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";

function extensionStaticAssets() {
  return {
    name: "extension-static-assets",
    closeBundle() {
      const outputDir = path.resolve(__dirname, "dist");
      for (const filename of ["manifest.json", "popup.html", "popup.js"]) {
        fs.copyFileSync(path.resolve(__dirname, filename), path.resolve(outputDir, filename));
      }
      JSON.parse(fs.readFileSync(path.resolve(outputDir, "manifest.json"), "utf8"));
    }
  };
}

export default defineConfig({
  plugins: [extensionStaticAssets()],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "chrome120",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, "src/background/index.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        format: "es"
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
