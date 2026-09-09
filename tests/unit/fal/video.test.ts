import { describe, expect, it } from "vitest";

import { buildVideoRequest, pickVideoSlug } from "@/lib/fal/video";

describe("video adapter", () => {
  it("routes Seedance modes through standard and fast endpoints", () => {
    expect(pickVideoSlug({ model: "seedance-2.0", mode: "text", tier: "fast" })).toBe(
      "bytedance/seedance-2.0/fast/text-to-video",
    );
    expect(pickVideoSlug({ model: "seedance-2.0", mode: "reference", tier: "standard" })).toBe(
      "bytedance/seedance-2.0/reference-to-video",
    );
  });

  it("routes Veo 3.1 Fast Reference to its reference endpoint", () => {
    expect(pickVideoSlug({ model: "veo3.1-fast-reference", mode: "reference", tier: "fast" })).toBe(
      "fal-ai/veo3.1/fast/reference-to-video",
    );
  });

  it("builds Seedance image-to-video start and end frame payloads", () => {
    const request = buildVideoRequest({
      model: "seedance-2.0",
      mode: "image",
      tier: "fast",
      prompt: "slow orbit around the carving",
      imageUrls: ["https://example.com/start.png", "https://example.com/end.png"],
      aspectRatio: "auto",
      resolution: "720p",
      duration: "8",
      generateAudio: true,
      seed: 42,
    }) as Record<string, unknown>;

    expect(request.image_url).toBe("https://example.com/start.png");
    expect(request.end_image_url).toBe("https://example.com/end.png");
    expect(request.seed).toBe(42);
  });

  it("builds Veo reference payloads with image_urls", () => {
    const request = buildVideoRequest({
      model: "veo3.1-fast-reference",
      mode: "reference",
      tier: "fast",
      prompt: "animate @Image1 and @Image2 into one shot",
      imageUrls: ["https://example.com/a.png", "https://example.com/b.png"],
      aspectRatio: "16:9",
      resolution: "1080p",
      duration: "8s",
      generateAudio: false,
    }) as Record<string, unknown>;

    expect(request.image_urls).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
    expect(request.generate_audio).toBe(false);
  });

  it("rejects Veo text mode", () => {
    expect(() =>
      buildVideoRequest({
        model: "veo3.1-fast-reference",
        mode: "text",
        tier: "fast",
        prompt: "not supported",
        imageUrls: [],
        aspectRatio: "16:9",
        resolution: "720p",
        duration: "8s",
        generateAudio: true,
      }),
    ).toThrow(/does not support text-to-video/i);
  });
});
