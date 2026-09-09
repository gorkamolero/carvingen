import { describe, expect, it } from "vitest";

import {
  buildMeshRequest,
  extractMeshArtifacts,
  getHunyuanInputAssignments,
  pickMeshSlug,
} from "@/lib/fal/mesh";

describe("mesh adapter", () => {
  it("keeps existing Meshy mode slugs", () => {
    expect(pickMeshSlug("preview")).toBe("fal-ai/meshy/v6/image-to-3d");
    expect(pickMeshSlug("refine")).toBe("fal-ai/meshy/v6/image-to-3d");
  });

  it("uses Meshy multi-image endpoint for multiview beta", () => {
    expect(pickMeshSlug("preview", "meshy", { meshyUseMultiview: true })).toBe(
      "fal-ai/meshy/v6/multi-image-to-3d",
    );
  });

  it("uses the Hunyuan Pro image-to-3d slug when selected", () => {
    expect(pickMeshSlug("preview", "hunyuan")).toBe(
      "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
    );
  });

  it("builds a backward-compatible Meshy request from the first image", () => {
    expect(
      buildMeshRequest({
        provider: "meshy",
        mode: "preview",
        imageUrls: ["https://example.com/front.png", "https://example.com/left.png"],
      }),
    ).toEqual({
      model_type: "standard",
      image_url: "https://example.com/front.png",
      topology: "triangle",
      target_polycount: 30000,
      decimation_mode: undefined,
      symmetry_mode: "auto",
      should_remesh: true,
      should_texture: true,
      enable_pbr: false,
      pose_mode: "",
      enable_rigging: false,
      rigging_height_meters: 1.7,
      enable_animation: false,
      animation_action_id: 1001,
    });
  });

  it("builds Meshy multiview low-poly beta payloads", () => {
    expect(
      buildMeshRequest({
        provider: "meshy",
        mode: "preview",
        imageUrls: [
          "https://example.com/front.png",
          "https://example.com/left.png",
          "https://example.com/back.png",
          "https://example.com/right.png",
          "https://example.com/extra.png",
        ],
        meshyUseMultiview: true,
        meshyPolyMode: "low",
        meshyTopology: "quad",
        meshySymmetryMode: "off",
        meshyShouldTexture: false,
        meshyEnablePbr: true,
      }),
    ).toEqual({
      model_type: "lowpoly",
      image_urls: [
        "https://example.com/front.png",
        "https://example.com/left.png",
        "https://example.com/back.png",
        "https://example.com/right.png",
      ],
      topology: "quad",
      target_polycount: 3000,
      decimation_mode: 4,
      symmetry_mode: "off",
      should_remesh: true,
      should_texture: false,
      enable_pbr: false,
      pose_mode: "",
      enable_rigging: false,
      rigging_height_meters: 1.7,
      enable_animation: false,
      animation_action_id: 1001,
    });
  });

  it("builds Meshy rigging and animation payloads", () => {
    expect(
      buildMeshRequest({
        provider: "meshy",
        mode: "preview",
        imageUrls: ["https://example.com/character.png"],
        meshyPoseMode: "t-pose",
        meshyEnableAnimation: true,
        meshyRiggingHeightMeters: 1.9,
        meshyAnimationActionId: 1204,
      }),
    ).toMatchObject({
      image_url: "https://example.com/character.png",
      pose_mode: "t-pose",
      enable_rigging: true,
      rigging_height_meters: 1.9,
      enable_animation: true,
      animation_action_id: 1204,
    });
  });

  it("validates Meshy target polycount range", () => {
    expect(() =>
      buildMeshRequest({
        provider: "meshy",
        mode: "preview",
        imageUrls: ["https://example.com/front.png"],
        meshyTargetPolycount: 99,
      }),
    ).toThrow(/between 100 and 300,000/i);
  });

  it("maps Hunyuan connected images into selected view fields in order", () => {
    expect(
      buildMeshRequest({
        provider: "hunyuan",
        mode: "preview",
        imageUrls: [
          "https://example.com/front.png",
          "https://example.com/left.png",
          "https://example.com/back.png",
        ],
        hunyuanViewSlots: ["front", "left", "back"],
        hunyuanGenerateType: "Normal",
        hunyuanEnablePbr: true,
        hunyuanFaceCount: 120000,
      }),
    ).toEqual({
      input_image_url: "https://example.com/front.png",
      left_image_url: "https://example.com/left.png",
      back_image_url: "https://example.com/back.png",
      generate_type: "Normal",
      enable_pbr: true,
      face_count: 120000,
    });
  });

  it("defaults Hunyuan to front view with fal schema defaults", () => {
    expect(
      buildMeshRequest({
        provider: "hunyuan",
        mode: "preview",
        imageUrls: ["https://example.com/front.png"],
      }),
    ).toEqual({
      input_image_url: "https://example.com/front.png",
      generate_type: "Normal",
      enable_pbr: false,
      face_count: 500000,
    });
  });

  it("normalizes Hunyuan assignments to always include front first", () => {
    expect(
      getHunyuanInputAssignments(["left", "back"], [
        "https://example.com/front.png",
        "https://example.com/left.png",
      ]),
    ).toEqual([
      {
        slot: "front",
        field: "input_image_url",
        imageUrl: "https://example.com/front.png",
      },
      {
        slot: "left",
        field: "left_image_url",
        imageUrl: "https://example.com/left.png",
      },
      {
        slot: "back",
        field: "back_image_url",
        imageUrl: null,
      },
    ]);
  });

  it("validates Hunyuan face count range", () => {
    expect(() =>
      buildMeshRequest({
        provider: "hunyuan",
        mode: "preview",
        imageUrls: ["https://example.com/front.png"],
        hunyuanFaceCount: 39999,
      }),
    ).toThrow(/between 40,000 and 1,500,000/i);
  });

  it("extracts Hunyuan model URL artifacts", () => {
    expect(
      extractMeshArtifacts({
        data: {
          thumbnail: { url: "https://example.com/preview.png" },
          model_glb: { url: "https://example.com/model.glb" },
          model_urls: {
            glb: { url: "https://example.com/model.glb" },
            obj: { url: "https://example.com/model.obj" },
            mtl: { url: "https://example.com/model.mtl" },
            texture: { url: "https://example.com/texture.png" },
          },
        },
      }),
    ).toEqual([
      { kind: "thumbnail", sourceUrl: "https://example.com/preview.png" },
      { kind: "glb", sourceUrl: "https://example.com/model.glb" },
      { kind: "obj", sourceUrl: "https://example.com/model.obj" },
      { kind: "mtl", sourceUrl: "https://example.com/model.mtl" },
      { kind: "texture", sourceUrl: "https://example.com/texture.png" },
    ]);
  });
});
