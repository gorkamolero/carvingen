import { MESH_MODEL_SLUGS, type MeshMode } from "@/lib/fal/models";

export type MeshRequestInput = {
  imageUrl: string;
  mode: MeshMode;
};

export function pickMeshSlug(mode: MeshMode) {
  return MESH_MODEL_SLUGS[mode];
}

export function buildMeshRequest(input: MeshRequestInput) {
  return {
    image_url: input.imageUrl,
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
      if (value && typeof value === "object" && "url" in value && typeof value.url === "string") {
        artifacts.push({ kind, sourceUrl: value.url });
      }
    }
  }

  return artifacts;
}
