import { z } from "zod";
import { tripoOptionsSchema } from "./schema";

export const CHARACTER_ENDPOINTS = {
  p2: "tripo3d/p2/image-to-3d",
  h31: "tripo3d/h3.1/image-to-3d",
  h31Multiview: "tripo3d/h3.1/multiview-to-3d",
  v25Multiview: "tripo3d/tripo/v2.5/multiview-to-3d",
  remesh: "tripo3d/tripo/remesh",
  rig: "fal-ai/meshy/rigging",
  animate: "fal-ai/meshy/rigging/multi-animation",
  multiview: "fal-ai/nano-banana-2/edit",
} as const;

export function buildTripoRequest(provider: "tripo-p2" | "tripo-h31", raw: unknown, images: string[]) {
  const d = tripoOptionsSchema.parse(raw);
  z.array(z.url()).min(1).parse(images);
  const p2 = provider === "tripo-p2";
  const max = p2 ? (d.tripoQuad ? 25000 : 50000) : 2000000;
  z.number().int().min(p2 ? 48 : 1000).max(max).parse(d.tripoFaceLimit);
  if (!p2 && !["standard", "detailed"].includes(d.tripoTextureQuality)) throw new Error("H3.1 texture quality must be standard or detailed.");
  if (p2 && d.tripoTextureQuality === "fast" && d.tripoTextureVersion !== "v3.5-20260815") throw new Error("Fast textures require v3.5-20260815.");
  if (!p2 && d.tripoMultiview) z.array(z.url()).min(2).max(4).parse(images);
  return {
    ...(!p2 && d.tripoMultiview ? { image_urls: images } : { image_url: images[0] }),
    face_limit: d.tripoFaceLimit, quad: d.tripoQuad,
    texture: d.tripoTexture || d.tripoPbr, pbr: d.tripoPbr,
    texture_quality: d.tripoTextureQuality, auto_size: d.tripoAutoSize,
    model_seed: d.tripoModelSeed, texture_seed: d.tripoTextureSeed,
    ...(p2 ? { texture_version: d.tripoTextureVersion, delight: d.tripoDelight, export_uv: d.tripoExportUv, export_orientation: d.tripoExportOrientation }
      : { geometry_quality: d.tripoGeometryQuality, texture_alignment: d.tripoTextureAlignment, orientation: d.tripoOrientation }),
  };
}
export function buildRemeshRequest(modelUrl: string, faceLimit: number, quad = false) {
  z.url().parse(modelUrl);
  z.number().int().min(500).max(quad ? 10000 : 20000).parse(faceLimit);
  return { mesh_url: modelUrl, face_limit: faceLimit, quad, bake: true };
}
export function buildRigRequest(modelUrl: string, heightMeters: number) {
  z.url().parse(modelUrl); z.number().positive().parse(heightMeters);
  return { model_url: modelUrl, height_meters: heightMeters, enable_animation: false };
}
export function buildAnimationRequest(modelUrl: string, heightMeters: number, ids: number[]) {
  const base = buildRigRequest(modelUrl, heightMeters);
  const unique = [...new Set(ids)];
  z.array(z.number().int().min(0).max(696)).min(1).max(10).parse(unique);
  return { model_url: base.model_url, height_meters: base.height_meters, animation_action_ids: unique };
}
export { ANIMATION_PRESETS } from "./animation-library";
const VIEW_ANGLE: Record<string, string> = {
  front: "The whole body faces the camera.",
  left: "Strict 90-degree side profile: rotate the whole body, hips, shoulders, feet and head together so the character faces screen left; only one eye is visible and the arms extend toward and away from the camera.",
  back: "The whole body faces away from the camera; the face is not visible.",
};
export function viewPrompts(includeBack: boolean, equipment: string) {
  const views = ["front", "left", ...(includeBack ? ["back"] : [])];
  return [
    ...views.map((view) => ({ name: view, prompt: [
      `Using the reference image, create a clean direct ${view} view of the same character. ${VIEW_ANGLE[view]}`,
      "Full body from head to feet, single isolated character, neutral white studio background.",
      "Game character turnaround sheet style, orthographic camera, centered composition.",
      "Preserve the same face, body proportions, skin tone, clothing colors, fabric damage, hair, and distinctive accessories.",
      "Pose for 3D reconstruction: standing T-pose with straight arms away from torso, legs visible and not crossed.",
      "No text, no labels, no held equipment, no scenery, no floor shadows, no extra people, no cropped limbs.",
    ].join(" ") })),
    ...equipment.split(",").map((s) => s.trim()).filter(Boolean).map((name) => ({ name: `equipment-${name}`, prompt: `Product shot of a single ${name} that matches this character's style and colors, shown on its own as a game equipment asset. The ${name} alone, fully visible, flat orthographic front view, centered on a pure white background. Do not show the character, any person, body, face, legs, hands or arms; nothing holds or wears the ${name}. No text, no shadows.` })),
  ];
}

export type RemoteArtifact = { name: string; kind: string; sourceUrl: string };
/** Walk nested provider files, preserving distinct variants and every clip. */
export function extractCharacterArtifacts(data: unknown): RemoteArtifact[] {
  const out: RemoteArtifact[] = [];
  function walk(value: unknown, path: string[]) {
    if (!value) return;
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, [...path, String(i)])); return; }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (typeof obj.url === "string") { add(obj.url, path, String(obj.file_name ?? "")); return; }
      Object.entries(obj).forEach(([k, v]) => walk(v, [...path, k]));
    } else if (typeof value === "string" && /^https:\/\//.test(value)) add(value, path, "");
  }
  function add(url: string, path: string[], filename: string) {
    const name = path.join("-");
    const ext = (filename || new URL(url).pathname).split(".").pop()?.toLowerCase();
    const kind = ["glb", "fbx", "obj", "usdz", "stl", "mtl"].includes(ext ?? "") ? ext!
      : /video/.test(name) ? "video"
      : /thumbnail|rendered_image/.test(name) ? "thumbnail"
      : /texture/.test(name) ? "texture"
      : /images/.test(name) ? "image"
      : /glb|fbx/.exec(name)?.[0];
    if (kind && !out.some((a) => a.sourceUrl === url)) out.push({ name, kind, sourceUrl: url });
  }
  walk(data, []); return out;
}
