import { describe, expect, it } from "vitest";

import { markDownstreamInputsChanged } from "@/lib/graph/inputs-changed";
import {
  createMeshNodeData,
  createPromptNodeData,
  createVisionNodeData,
  createViewerNodeData,
  type CarvingEdge,
  type CarvingNode,
} from "@/lib/graph/types";

describe("markDownstreamInputsChanged", () => {
  it("marks prompt, vision, and mesh descendants dirty", () => {
    const nodes: CarvingNode[] = [
      { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: createPromptNodeData() },
      { id: "b", type: "prompt", position: { x: 0, y: 0 }, data: createPromptNodeData() },
      { id: "c", type: "vision", position: { x: 0, y: 0 }, data: createVisionNodeData() },
      { id: "d", type: "mesh", position: { x: 0, y: 0 }, data: createMeshNodeData() },
      { id: "e", type: "viewer", position: { x: 0, y: 0 }, data: createViewerNodeData() },
    ];
    const edges: CarvingEdge[] = [
      { id: "ab", source: "a", sourceHandle: "image-out", target: "b", targetHandle: "image-in", data: { kind: "image" } },
      { id: "bc", source: "b", sourceHandle: "image-out", target: "c", targetHandle: "image-in", data: { kind: "image" } },
      { id: "bd", source: "b", sourceHandle: "image-out", target: "d", targetHandle: "image-in", data: { kind: "image" } },
      { id: "de", source: "d", sourceHandle: "glb-out", target: "e", targetHandle: "glb-in", data: { kind: "glb" } },
    ];

    const result = markDownstreamInputsChanged("a", nodes, edges);

    expect(result.find((node) => node.id === "b")?.type).toBe("prompt");
    expect((result.find((node) => node.id === "b") as Extract<CarvingNode, { type: "prompt" }>).data.inputsChangedSinceLastRun).toBe(true);
    expect((result.find((node) => node.id === "c") as Extract<CarvingNode, { type: "vision" }>).data.inputsChangedSinceLastRun).toBe(true);
    expect((result.find((node) => node.id === "d") as Extract<CarvingNode, { type: "mesh" }>).data.inputsChangedSinceLastRun).toBe(true);
  });
});
