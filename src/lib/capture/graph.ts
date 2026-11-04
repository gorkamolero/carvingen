import type { CarvingNode, ProjectGraph } from "@/lib/graph/types";
import { getIncomingGlbAssetId, getIncomingImageAssetIds, getNodeImageAssetId } from "@/lib/graph/selectors";
export function orderedNodes(graph: ProjectGraph) {
  const result: CarvingNode[] = [], visited = new Set<string>();
  function visit(node: CarvingNode) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    for (const edge of graph.edges.filter((e) => e.target === node.id)) {
      const parent = graph.nodes.find((n) => n.id === edge.source);
      if (parent) visit(parent);
    }
    result.push(node);
  }
  graph.nodes.forEach(visit);
  return result;
}
export function viewerEntries(graph: ProjectGraph) {
  const counts = new Map<string, number>();
  return orderedNodes(graph).filter((n) => n.type === "viewer").map((node) => {
    const edge = graph.edges.find((e) => e.target === node.id && e.targetHandle === "glb-in");
    const kind = graph.nodes.find((n) => n.id === edge?.source)?.type ?? "viewer";
    const index = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, index);
    return { node, label: `${kind}${index > 1 ? `-${index}` : ""}`, asset: getIncomingGlbAssetId(node.id, graph.nodes, graph.edges) };
  });
}
export function sheetEntries(graph: ProjectGraph, node: CarvingNode) {
  if (node.type !== "multiview") return [];
  return [...getIncomingImageAssetIds(node.id, graph.nodes, graph.edges).map((asset, i) => ({ label: i ? `Input ${i + 1}` : "Input", asset })),
    ...Object.entries(node.data.artifactAssetIds).map(([label, asset]) => ({ label, asset }))];
}
export function currentOutputs(node: CarvingNode): string[] {
  const d = node.data;
  if ("outputAssetId" in d && d.outputAssetId) return [d.outputAssetId];
  if (node.type === "multiview") return Object.values(node.data.artifactAssetIds);
  const image = getNodeImageAssetId(node);
  if (image) return [image];
  return "outputAssetIds" in d ? d.outputAssetIds.slice(-1) : [];
}
export function safeName(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "clip"; }
