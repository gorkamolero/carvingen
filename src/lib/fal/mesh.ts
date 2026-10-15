import { HUNYUAN_MESH_SLUG, MESHY_MULTI_IMAGE_SLUG, MESH_MODEL_SLUGS, type MeshMode } from "@/lib/fal/models";
import type { MeshNodeData } from "@/lib/graph/types";

export type MeshRequestInput = Partial<MeshNodeData> & {
  mode: MeshMode;
  imageUrl?: string;
  imageUrls?: string[];
};

export function pickMeshSlug(mode: MeshMode, provider: MeshNodeData["provider"] = "meshy", options: Pick<MeshRequestInput, "meshyUseMultiview"> = {}) {
  if (provider === "hunyuan") return HUNYUAN_MESH_SLUG;
  return options.meshyUseMultiview ? MESHY_MULTI_IMAGE_SLUG : MESH_MODEL_SLUGS[mode];
}

const HUNYUAN_VIEW_FIELDS = {
  front: "input_image_url", left: "left_image_url", back: "back_image_url", right: "right_image_url",
} as const;

export function getHunyuanInputAssignments(slots: MeshNodeData["hunyuanViewSlots"] = ["front"], imageUrls: string[] = []) {
  const ordered = [...new Set(["front" as const, ...slots])];
  return ordered.map((slot, index) => ({ slot, field: HUNYUAN_VIEW_FIELDS[slot], imageUrl: imageUrls[index] ?? null }));
}

export function buildMeshRequest(input: MeshRequestInput): Record<string, unknown> {
  const imageUrls = input.imageUrls ?? (input.imageUrl ? [input.imageUrl] : []);
  if (!imageUrls.length || imageUrls.some((url) => !url.trim())) throw new Error("Connect an image before running Mesh.");
  if (input.provider === "hunyuan") {
    const faceCount = input.hunyuanFaceCount ?? 500000;
    if (!Number.isInteger(faceCount) || faceCount < 40000 || faceCount > 1500000) throw new Error("Hunyuan face count must be between 40,000 and 1,500,000.");
    return {
      ...Object.fromEntries(getHunyuanInputAssignments(input.hunyuanViewSlots, imageUrls)
        .filter((assignment) => assignment.imageUrl !== null).map(({ field, imageUrl }) => [field, imageUrl])),
      generate_type: input.hunyuanGenerateType ?? "Normal",
      enable_pbr: input.hunyuanEnablePbr ?? false,
      face_count: faceCount,
    };
  }
  const low = input.meshyPolyMode === "low";
  const polycount = input.meshyTargetPolycount ?? (low ? 3000 : 30000);
  if (!Number.isInteger(polycount) || polycount < 100 || polycount > 300000) throw new Error("Meshy target polycount must be between 100 and 300,000.");
  const texture = input.meshyShouldTexture ?? true;
  const animation = input.meshyEnableAnimation ?? false;
  return {
    model_type: low ? "lowpoly" : "standard",
    ...(input.meshyUseMultiview ? { image_urls: imageUrls.slice(0, 4) } : { image_url: imageUrls[0] }),
    topology: input.meshyTopology ?? "triangle",
    target_polycount: polycount,
    decimation_mode: low ? 4 : undefined,
    symmetry_mode: input.meshySymmetryMode ?? "auto",
    should_remesh: input.meshyShouldRemesh ?? true,
    should_texture: texture,
    enable_pbr: texture && (input.meshyEnablePbr ?? false),
    pose_mode: input.meshyPoseMode ?? "",
    enable_rigging: animation || (input.meshyEnableRigging ?? false),
    rigging_height_meters: input.meshyRiggingHeightMeters ?? 1.7,
    enable_animation: animation,
    animation_action_id: input.meshyAnimationActionId ?? 1001,
  };
}

export function extractMeshArtifacts(result: Record<string, unknown>) {
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) {
    return [];
  }

  const artifacts: Array<{ kind: string; sourceUrl: string }> = [];

  const directFields: Array<[string, string]> = [
    ["thumbnail", "thumbnail"],
    ["video", "video"],
    ["model_glb", "glb"],
    ["animation_glb", "animation-glb"],
    ["animation_fbx", "animation-fbx"],
  ];

  for (const [field, kind] of directFields) {
    const value = data[field];
    if (typeof value === "string") {
      artifacts.push({ kind, sourceUrl: value });
    } else if (value && typeof value === "object" && "url" in value && typeof value.url === "string") {
      artifacts.push({ kind, sourceUrl: value.url });
    }
  }

  const modelUrls = data.model_urls;
  if (modelUrls && typeof modelUrls === "object") {
    for (const [kind, value] of Object.entries(modelUrls)) {
      if (typeof value === "string") {
        artifacts.push({ kind, sourceUrl: value });
      } else if (value && typeof value === "object" && "url" in value && typeof value.url === "string") {
        artifacts.push({ kind, sourceUrl: value.url });
      }
    }
  }

  return artifacts.filter((artifact, index) => artifacts.findIndex((other) => other.kind === artifact.kind && other.sourceUrl === artifact.sourceUrl) === index);
}
