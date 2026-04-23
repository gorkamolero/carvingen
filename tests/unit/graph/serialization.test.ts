import { describe, expect, it } from "vitest";

import { validateProjectGraph } from "@/lib/graph/serialization";
import { createPromptNodeData, createVisionNodeData } from "@/lib/graph/types";

describe("validateProjectGraph", () => {
  it("accepts a valid prompt-only graph", () => {
    const graph = validateProjectGraph({
      id: "project-1",
      name: "Test",
      nodes: [
        {
          id: "node-1",
          type: "prompt",
          position: { x: 10, y: 20 },
          data: createPromptNodeData(),
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(graph.nodes).toHaveLength(1);
  });

  it("accepts a graph with a vision node", () => {
    const graph = validateProjectGraph({
      id: "project-vision",
      name: "Vision",
      nodes: [
        {
          id: "prompt-1",
          type: "prompt",
          position: { x: 10, y: 20 },
          data: createPromptNodeData(),
        },
        {
          id: "vision-1",
          type: "vision",
          position: { x: 200, y: 20 },
          data: createVisionNodeData(),
        },
      ],
      edges: [
        {
          id: "prompt-vision",
          source: "prompt-1",
          sourceHandle: "image-out",
          target: "vision-1",
          targetHandle: "image-in",
          data: { kind: "image" },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(graph.nodes.find((node) => node.id === "vision-1")?.type).toBe("vision");
  });
});
