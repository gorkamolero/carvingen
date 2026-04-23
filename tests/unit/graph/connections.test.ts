import { describe, expect, it } from "vitest";

import { canConnect } from "@/lib/graph/connections";

describe("canConnect", () => {
  it("allows matching image handles", () => {
    expect(
      canConnect({
        source: "a",
        sourceHandle: "image-out",
        target: "b",
        targetHandle: "image-in",
      }),
    ).toBe(true);
  });

  it("rejects mismatched handle kinds", () => {
    expect(
      canConnect({
        source: "a",
        sourceHandle: "image-out",
        target: "b",
        targetHandle: "glb-in",
      }),
    ).toBe(false);
  });
});
