/**
 * Renderer-side type boundary. UI and orchestration code consume the domain
 * contracts through this single adapter so the renderer does not fan out to
 * the shared package from every module.
 */
export type * from "@studio/workflow/renderer-contracts";
