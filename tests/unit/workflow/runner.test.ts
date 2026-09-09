import { describe, expect, it } from "vitest";

import {
  buildWorkflowGraph,
  parseWorkflowDefinition,
  runWorkflow,
  type UploadedWorkflowAsset,
} from "@/lib/workflow/runner";

describe("workflow runner", () => {
  it("parses workflow defaults", () => {
    const workflow = parseWorkflowDefinition({
      project: { name: "Dry workflow" },
      nodes: [{ id: "text_video", type: "video", data: { mode: "text", text: "A studio shot" } }],
    });

    expect(workflow.project.mode).toBe("create");
    expect(workflow.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(workflow.nodes[0]?.run).toBe(false);
  });

  it("builds a graph with uploaded image assets and inferred edge kinds", () => {
    const workflow = parseWorkflowDefinition({
      project: { name: "Graph" },
      assets: [{ id: "front", path: "./front.png", kind: "image" }],
      nodes: [
        {
          id: "image_front",
          type: "image",
          position: { x: 100, y: 120 },
          asset: "front",
        },
        {
          id: "video_1",
          type: "video",
          position: { x: 500, y: 120 },
          data: {
            text: "Slow orbit",
            mode: "image",
            aspectRatio: "16:9",
            duration: "8",
          },
        },
      ],
      edges: [
        {
          source: "image_front",
          sourceHandle: "image-out",
          target: "video_1",
          targetHandle: "image-in",
        },
      ],
    });
    const assets = new Map<string, UploadedWorkflowAsset>([
      [
        "front",
        {
          id: "front",
          assetId: "asset-front",
          url: "/api/assets/asset-front",
          path: "./front.png",
          kind: "image",
        },
      ],
    ]);

    const graph = buildWorkflowGraph({
      workflow,
      projectId: "project-1",
      assetsById: assets,
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges[0]?.data?.kind).toBe("image");
    const image = graph.nodes.find((node) => node.id === "project-1-image_front");
    expect(image?.type).toBe("image");
    if (image?.type === "image") {
      expect(image.data.assetId).toBe("asset-front");
    }
  });

  it("prints a dry-run graph without uploading or running providers", async () => {
    const workflow = parseWorkflowDefinition({
      project: { name: "Dry" },
      assets: [{ id: "front", path: "./missing-on-purpose.png", kind: "image" }],
      nodes: [
        { id: "image_front", type: "image", asset: "front" },
        {
          id: "video_1",
          type: "video",
          run: true,
          data: {
            text: "Slow orbit",
            mode: "image",
            aspectRatio: "16:9",
            duration: "8",
          },
        },
      ],
      edges: [
        {
          source: "image_front",
          sourceHandle: "image-out",
          target: "video_1",
          targetHandle: "image-in",
        },
      ],
    });

    const summary = await runWorkflow(workflow, {
      dryRun: true,
      publicUrl: "https://example.com",
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.nodesRun).toEqual([]);
    const image = summary.graph.nodes.find((node) => node.id === "image_front");
    expect(image?.type).toBe("image");
    if (image?.type === "image") {
      expect(image.data.assetId).toBe("dry-front");
      expect(image.data.previewUrl).toBe("https://example.com/api/assets/dry-front");
    }
  });
});
