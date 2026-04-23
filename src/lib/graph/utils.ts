import type { Viewport } from "@xyflow/react";

import {
  type CarvingEdge,
  type CarvingNode,
  type ProjectGraph,
} from "@/lib/graph/types";

export const DEFAULT_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

export function createEmptyProjectGraph(id: string, name: string): ProjectGraph {
  return {
    id,
    name,
    nodes: [] satisfies CarvingNode[],
    edges: [] satisfies CarvingEdge[],
    viewport: DEFAULT_VIEWPORT,
  };
}
