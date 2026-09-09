import { createVideoProviderActions } from "@studio/workflow/orchestration/video-provider-actions";

/**
 * Renderer composition boundary for provider actions.
 *
 * The application model owns lifecycle state, while provider orchestration is
 * assembled in this module. Keeping this factory free of React hooks makes the
 * boundary observable in tests and prevents the application hook from becoming
 * the provider's second composition root.
 */
export function composeStudioProviderActions(
  input: Parameters<typeof createVideoProviderActions>[0]
): ReturnType<typeof createVideoProviderActions> {
  return createVideoProviderActions(input);
}
