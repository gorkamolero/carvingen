import { describe, expect, it } from "vitest";

import { portfolioDemoGraph } from "@/features/demo/portfolio-demo-fixture";
import { validateProjectGraph } from "@/lib/graph/serialization";

describe("portfolio demo fixture", () => {
  it("is a valid project graph with the public proof node chain", () => {
    const graph = validateProjectGraph(portfolioDemoGraph);

    expect(graph.id).toBe("portfolio-demo");
    expect(graph.nodes.map((node) => node.type)).toEqual(["image", "prompt", "mesh", "viewer"]);
    expect(graph.edges.map((edge) => edge.data?.kind)).toEqual(["image", "image", "glb"]);
  });

  it("uses inline public fixture assets instead of local file or generated-output paths", () => {
    const serialized = JSON.stringify(portfolioDemoGraph);

    expect(serialized).toContain("data:image/svg+xml");
    expect(serialized).not.toMatch(new RegExp(String.raw`\.env|carvingen\.sqlite|outputs?/|tmp/|Users/|file:`, "i"));
  });
});
