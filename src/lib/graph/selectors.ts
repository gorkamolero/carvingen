import { getAssetUrl } from "@/lib/assets/url";
import type { CarvingEdge, CarvingNode } from "@/lib/graph/types";

export function getNodeById(nodes: readonly CarvingNode[], nodeId: string) {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

export function getLatestPromptAssetId(node: CarvingNode) {
  return node.type === "prompt" ? node.data.outputAssetIds.at(-1) ?? null : null;
}

/**
 * The "active" generation on a Prompt node — the one shown in the main
 * output slot and flowed to downstream nodes. Falls back to the latest
 * run when no explicit selection has been made.
 */
export function getActivePromptAssetId(node: CarvingNode) {
  if (node.type !== "prompt") return null;
  const { activeAssetId, outputAssetIds } = node.data;
  if (activeAssetId && outputAssetIds.includes(activeAssetId)) {
    return activeAssetId;
  }
  return outputAssetIds.at(-1) ?? null;
}

export function getNodeImageAssetId(node: CarvingNode) {
  if (node.type === "image") {
    return node.data.assetId;
  }

  if (node.type === "prompt") {
    return getActivePromptAssetId(node);
  }

  return null;
}

/**
 * Direct-only lookup: for a given node, returns the list of asset ids
 * feeding its `image-in` handle. Used for Mesh, Vision, and Prompt nodes
 * with chainSources disabled.
 */
function collectDirectIncoming(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
): string[] {
  return edges
    .filter((edge) => edge.target === nodeId && edge.targetHandle === "image-in")
    .map((edge) => getNodeById(nodes, edge.source))
    .map((node) => (node ? getNodeImageAssetId(node) : null))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Recursive lookup used when a Prompt node has `chainSources` enabled.
 * For each incoming edge, include the direct source's asset id; if the
 * source is itself a Prompt, also include every ancestor's asset id
 * transitively. Cycles are prevented via the `visited` guard — the
 * DAG shouldn't have cycles, but defensively so.
 */
function collectAncestorIncoming(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
  visited: Set<string>,
): string[] {
  if (visited.has(nodeId)) {
    return [];
  }
  visited.add(nodeId);

  const out: string[] = [];
  const directEdges = edges.filter(
    (edge) => edge.target === nodeId && edge.targetHandle === "image-in",
  );

  for (const edge of directEdges) {
    const src = getNodeById(nodes, edge.source);
    if (!src) continue;

    const directAsset = getNodeImageAssetId(src);
    if (directAsset) {
      out.push(directAsset);
    }

    if (src.type === "prompt") {
      out.push(...collectAncestorIncoming(src.id, nodes, edges, visited));
    }
  }

  return out;
}

export function getIncomingImageAssetIds(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
) {
  const target = getNodeById(nodes, nodeId);
  const chainOn =
    target?.type === "prompt" ? (target.data.chainSources ?? false) : false;

  const collected = chainOn
    ? collectAncestorIncoming(nodeId, nodes, edges, new Set())
    : collectDirectIncoming(nodeId, nodes, edges);

  // Dedupe while preserving wire order (first occurrence wins).
  return Array.from(new Set(collected));
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

/**
 * Count the number of upstream Prompt ancestors. Used by the UI to decide
 * whether the chain toggle is meaningful (there's actual upstream to chain).
 */
export function countUpstreamPromptAncestors(
  nodeId: string,
  nodes: readonly CarvingNode[],
  edges: readonly CarvingEdge[],
): number {
  const visited = new Set<string>();
  let count = 0;

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const edge of edges) {
      if (edge.target !== id || edge.targetHandle !== "image-in") continue;
      const src = getNodeById(nodes, edge.source);
      if (src?.type === "prompt") {
        count += 1;
        walk(src.id);
      }
    }
  }

  walk(nodeId);
  return count;
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
