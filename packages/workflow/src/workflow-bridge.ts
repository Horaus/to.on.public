/** Injectable browser bridge for workflow orchestration.
 * Workflow actions depend on this contract, never on the DOM global directly.
 */
export type WorkflowBridge = NonNullable<Window["studioBridge"]>;

let activeBridge: WorkflowBridge | undefined;

export function configureWorkflowBridge(bridge: WorkflowBridge | undefined) {
  activeBridge = bridge;
}

export function getWorkflowBridge(): WorkflowBridge {
  return activeBridge as WorkflowBridge;
}
