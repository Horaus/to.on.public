import type { ProductionGraph, ProductionGraphIssue } from "./contracts";

export function validateProductionGraph(graph: ProductionGraph): ProductionGraphIssue[] {
  const issues: ProductionGraphIssue[] = [];
  const ids = [...graph.groups.map((item) => item.id), ...graph.nodes.map((item) => item.id), ...graph.edges.map((item) => item.id), ...graph.artifacts.map((item) => item.id)];
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of new Set(duplicateIds)) issues.push({ code: "duplicate_id", message: `Duplicate graph id: ${id}` });
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const fromNode = nodes.get(edge.from.nodeId);
    const toNode = nodes.get(edge.to.nodeId);
    if (!fromNode || !toNode) {
      issues.push({ code: "missing_node", edgeId: edge.id, message: `Edge ${edge.id} points to a missing node.` });
      continue;
    }
    const fromPort = fromNode.outputs.find((port) => port.id === edge.from.portId);
    const toPort = toNode.inputs.find((port) => port.id === edge.to.portId);
    if (!fromPort || !toPort) {
      issues.push({ code: "missing_port", edgeId: edge.id, message: `Edge ${edge.id} points to a missing port.` });
      continue;
    }
    const compatible = edge.artifactKinds.every((kind) => fromPort.artifactKinds.includes(kind) && toPort.artifactKinds.includes(kind));
    if (!compatible) issues.push({ code: "incompatible_artifact", edgeId: edge.id, message: `Edge ${edge.id} violates its port artifact contract.` });
  }
  return issues;
}
