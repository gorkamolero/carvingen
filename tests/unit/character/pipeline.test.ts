import { describe, expect, it, vi } from "vitest";
import { buildTripoRequest, buildRemeshRequest, buildRigRequest, buildAnimationRequest, extractCharacterArtifacts, viewPrompts, ANIMATION_PRESETS } from "@/lib/character/fal";
import { canConnectNodes } from "@/lib/graph/connections";
import { parseBlenderProgress } from "@/lib/character/progress";
import { characterInputs, resultPatch } from "@/lib/character/client";
import { createPipelineData } from "@/lib/character/schema";
import { createMeshNodeData, type CarvingNode, type CarvingEdge } from "@/lib/graph/types";
import { makeZip } from "@/lib/character/zip";
import boneMap from "../../../scripts/blender/bone-map.json";
vi.mock("@fal-ai/client", () => ({ fal: { queue: { submit: vi.fn(() => { throw new Error("Paid generation is forbidden in tests"); }) } } }));
const image = "https://fal.media/front.png";
describe("character payload builders", () => {
  it("uses only P2 schema fields, enables textures for PBR", () => {
    const p = buildTripoRequest("tripo-p2", { tripoTexture: false }, [image]);
    expect(p).toMatchObject({ image_url: image, face_limit: 30000, texture: true, pbr: true, export_uv: true });
    expect(p).not.toHaveProperty("output_format");
    expect(() => buildTripoRequest("tripo-p2", { tripoQuad: true, tripoFaceLimit: 30000 }, [image])).toThrow();
    expect(() => buildTripoRequest("tripo-p2", { tripoTextureQuality: "fast", tripoTextureVersion: "v2.5-20250123" }, [image])).toThrow();
  });
  it("builds H3.1 single and ordered multi-view inputs", () => {
    expect(buildTripoRequest("tripo-h31", { tripoTexture: false, tripoPbr: false }, [image])).toMatchObject({ texture: false, pbr: false, geometry_quality: "standard" });
    expect(buildTripoRequest("tripo-h31", { tripoMultiview: true }, [image, image])).toHaveProperty("image_urls", [image, image]);
    expect(() => buildTripoRequest("tripo-h31", { tripoMultiview: true }, [image])).toThrow();
    expect(() => buildTripoRequest("tripo-h31", { tripoTextureQuality: "extreme" }, [image])).toThrow();
  });
  it("validates remesh face limits including quad limit", () => {
    expect(buildRemeshRequest(image, 12000)).toEqual({ mesh_url: image, face_limit: 12000, quad: false, bake: true });
    expect(() => buildRemeshRequest(image, 12000, true)).toThrow();
  });
  it("builds standalone rig and multi-animation without invented task reuse", () => {
    expect(buildRigRequest(image, 1.8)).toEqual({ model_url: image, height_meters: 1.8, enable_animation: false });
    expect(buildAnimationRequest(image, 1.8, [0, 669, 0])).toEqual({ model_url: image, height_meters: 1.8, animation_action_ids: [0, 669] });
    expect(() => buildAnimationRequest(image, 1.8, [])).toThrow();
    expect(() => buildAnimationRequest(image, 1.8, [697])).toThrow();
    expect(() => buildRigRequest(image, 0)).toThrow();
  });
  it("keeps every nested file and distinct clip", () => {
    expect(extractCharacterArtifacts({ model_mesh: { url: "https://fal.media/a.fbx" }, model_urls: { fbx: { url: "https://fal.media/a.fbx" }, pbr_model: { url: "https://fal.media/b.glb" } }, animations: [{ animation_glb: { url: "https://fal.media/c.glb" } }, { animation_glb: { url: "https://fal.media/d.glb" } }] })).toHaveLength(4);
  });
  it("generates front first, side, optional back and separate cutouts", () => {
    expect(viewPrompts(false, "sword, shield").map((v) => v.name)).toEqual(["front", "right", "equipment-sword", "equipment-shield"]);
    expect(ANIMATION_PRESETS.find((p) => p.id === 0)?.name).toBe("Idle");
    expect(ANIMATION_PRESETS.find((p) => p.id === 669)?.name).toMatch(/Walk/);
  });
});
describe("character graph", () => {
  it.each([ ["image", "multiview", "image"], ["multiview", "mesh", "image"], ["multiview", "prompt", "image"], ["mesh", "bake", "glb"], ["bake", "rig", "glb"], ["rig", "animate", "glb"], ["animation", "animate", "animation"], ["animate", "export", "glb"], ...["mesh", "bake", "rig", "animate", "export"].map((n) => [n, "viewer", "glb"]) ])("connects %s to %s", (source, target, handle) => {
    expect(canConnectNodes({ source: "a", target: "b", sourceHandle: `${handle}-out`, targetHandle: `${handle}-in` }, source, target)).toBe(true);
  });
  it("rejects fake handles on real nodes and reversed direction", () => {
    expect(canConnectNodes({ source: "a", target: "b", sourceHandle: "glb-out", targetHandle: "glb-in" }, "image", "rig")).toBe(false);
    expect(canConnectNodes({ source: "a", target: "b", sourceHandle: "glb-in", targetHandle: "glb-out" }, "mesh", "rig")).toBe(false);
  });
  it("passes front by default and expands views only when requested", () => {
    const view: CarvingNode = { id: "v", type: "multiview", position: { x: 0, y: 0 }, data: { ...createPipelineData(), artifactAssetIds: { front: "f", left: "l", back: "b", "equipment-sword": "s" } } };
    const mesh: CarvingNode = { id: "m", type: "mesh", position: { x: 0, y: 0 }, data: createMeshNodeData() };
    const edges: CarvingEdge[] = [{ id: "e", source: "v", target: "m", sourceHandle: "image-out", targetHandle: "image-in" }];
    expect(characterInputs(mesh, [view, mesh], edges).imageAssetIds).toEqual(["f"]);
    mesh.data.provider = "tripo-h31"; mesh.data.tripoMultiview = true;
    expect(characterInputs(mesh, [view, mesh], edges).imageAssetIds).toEqual(["f", "l", "b"]);
    view.data.artifactAssetIds = { front: "f", right: "r", back: "b" };
    const inputs = characterInputs(mesh, [view, mesh], edges);
    expect(inputs.imageAssetIds).toEqual(["f", "b", "r"]);
    expect(inputs.viewNames).toEqual(["front", "back", "right"]);
  });
  it("appends output history", () => {
    expect(resultPatch({ outputAssetId: "new", assets: [{ name: "model", kind: "glb", assetId: "new" }] }, { outputAssetIds: ["old"] }).outputAssetIds).toEqual(["old", "new"]);
  });
});
describe("local pipeline helpers", () => {
  it("parses bounded progress lines and ignores Blender logging", () => {
    expect(parseBlenderProgress("PROGRESS 40 baking")).toEqual({ progress: 40, status: "baking" });
    expect(parseBlenderProgress("PROGRESS 101 bad")).toBeNull();
    expect(parseBlenderProgress("Blender 5.2")).toBeNull();
  });
  it("maps Mixamo canonical bones to Unity and UE names without collisions", () => {
    expect(boneMap.Hips).toEqual({ unity: "Hips", unreal: "pelvis" });
    expect(boneMap.LeftArm.unreal).toBe("upperarm_l");
    expect(boneMap.RightHandIndex1.unreal).toBe("index_01_r");
    for (const target of ["unity", "unreal"] as const) expect(new Set(Object.values(boneMap).map((m) => m[target])).size).toBe(Object.keys(boneMap).length);
  });
  it("writes ZIP directory and end records", () => {
    const zip = makeZip([{ name: "clip.fbx", data: Buffer.from("clip") }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 12)).toBe(1);
  });
});
