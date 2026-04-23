import { describe, expect, it } from "vitest";

import { buildVisionRequest, extractVisionAnswer, pickVisionSlug } from "@/lib/fal/vision";

describe("vision fal adapter", () => {
  it("builds a valid vision request", () => {
    expect(
      buildVisionRequest({
        prompt: "What object is this?",
        imageUrls: ["https://example.com/image.png"],
        model: "google/gemini-2.5-flash",
      }),
    ).toMatchObject({
      prompt: "What object is this?",
      image_urls: ["https://example.com/image.png"],
      model: "google/gemini-2.5-flash",
    });
  });

  it("extracts answer and cost", () => {
    expect(
      extractVisionAnswer({
        data: {
          output: "A carved wooden raven figurine.",
          usage: { cost: 0.0012 },
        },
      }),
    ).toEqual({
      answer: "A carved wooden raven figurine.",
      cost: 0.0012,
    });
  });

  it("returns the shared vision slug", () => {
    expect(pickVisionSlug()).toBe("openrouter/router/vision");
  });
});
