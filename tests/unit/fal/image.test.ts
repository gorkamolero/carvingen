import { describe, expect, it } from "vitest";

import { buildImageRequest, pickImageSlug } from "@/lib/fal/image";

describe("image adapter", () => {
  it("uses edit slug when references are present", () => {
    expect(pickImageSlug("fal-ai/nano-banana-2", ["https://example.com/ref.png"])).toBe(
      "fal-ai/nano-banana-2/edit",
    );
  });

  it("keeps flux on the same slug", () => {
    expect(pickImageSlug("fal-ai/flux-pro/kontext", ["https://example.com/ref.png"])).toBe(
      "fal-ai/flux-pro/kontext",
    );
  });

  it("drops seed for gpt-image-2", () => {
    const request = buildImageRequest({
      modelBase: "openai/gpt-image-2",
      prompt: "raven",
      referenceImages: [],
      aspectRatio: "1:1",
      resolution: "1K",
      seed: 42,
    }) as Record<string, unknown>;

    expect(request.seed).toBeUndefined();
    expect(request.image_size).toBe("square");
  });

  it("maps gpt-image-2 widescreen sizes to structured dimensions", () => {
    const request = buildImageRequest({
      modelBase: "openai/gpt-image-2",
      prompt: "raven",
      referenceImages: [],
      aspectRatio: "16:9",
      resolution: "2K",
    }) as Record<string, unknown>;

    expect(request.image_size).toEqual({
      width: 2048,
      height: 1152,
    });
  });
});
