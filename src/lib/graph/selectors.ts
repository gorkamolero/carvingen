import { getAssetUrl } from "@/lib/assets/url";
import type { CarvingEdge, CarvingNode } from "@/lib/graph/types";

export function getNodeById(nodes: readonly CarvingNode[], nodeId: string) {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

export function getLatestPromptAssetId(node: CarvingNode) {
  return node.type === "prompt" ? node.data.outputAssetIds.at(-1) ?? null : null;
}

export function getNodeImageAssetId(node: CarvingNode) {
  if (node.type === "image") {
    return node.data.assetId;
  }

  if (node.type === "prompt") {
    return getLatestPromptAssetId(node);
  }

  return null;
}

export function getIncomingImageAssetIds(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
) {
  return edges
    .filter((edge) => edge.target === nodeId && edge.targetHandle === "image-in")
    .map((edge) => getNodeById(nodes, edge.source))
    .map((node) => (node ? getNodeImageAssetId(node) : null))
    .filter(Boolean) as string[];
}

export function getIncomingImageUrls(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
) {
  return getIncomingImageAssetIds(nodeId, nodes, edges).map((assetId) => {
    if (typeof window !== "undefined") {
      const publicBaseUrl =
        document.body.dataset.publicUrl && document.body.dataset.publicUrl.length > 0
          ? document.body.dataset.publicUrl
          : window.location.origin;
      return new URL(getAssetUrl(assetId), publicBaseUrl).toString();
    }

    return getAssetUrl(assetId);
  });
}

export function getIncomingGlbAssetId(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
) {
  const edge = edges.find((candidate) => candidate.target === nodeId && candidate.targetHandle === "glb-in");
  if (!edge) {
    return null;
  }

  const sourceNode = getNodeById(nodes, edge.source);
  return sourceNode?.type === "mesh" ? sourceNode.data.outputAssetId : null;
}
