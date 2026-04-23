import type { CarvingEdge, CarvingNode } from "@/lib/graph/types";

export function markDownstreamInputsChanged(
  originNodeId: string,
  nodes: CarvingNode[],
  edges: CarvingEdge[],
) {
  const dirty = new Set<string>();
  const queue = [originNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source === current && !dirty.has(edge.target)) {
        dirty.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return nodes.map((node) => {
    if (!dirty.has(node.id)) {
      return node;
    }

    if (node.type === "prompt" || node.type === "mesh" || node.type === "vision") {
      return {
        ...node,
        data: {
          ...node.data,
          inputsChangedSinceLastRun: true,
        },
      } as CarvingNode;
    }

    return node;
  });
}
