// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
const state = vi.hoisted(() => ({ root: "", glb: "", calls: [] as unknown[], rows: new Map<string, { id: string; sourceUrl: string; url: string; localPath: string; mimeType: string; kind: string; originalFileName: string }>() }));
vi.mock("@/lib/db/repositories/jobs", () => ({ updateJobProgress: vi.fn(), createJob: vi.fn(), completeJob: vi.fn(), getJobById: vi.fn() }));
vi.mock("@/lib/db/repositories/assets", () => ({ getAssetById: vi.fn(async (id: string) => state.rows.get(id)), createAssetRecord: vi.fn() }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ ASSET_STORAGE_PATH: state.root }), getFalKey: () => "unit-test-placeholder" }));
vi.mock("@fal-ai/client", () => ({ fal: { config: vi.fn(), queue: {
  submit: vi.fn(async (slug, options) => { state.calls.push({ slug, ...options }); return { request_id: "mock-request" }; }),
  status: vi.fn(async () => ({ status: "COMPLETED" })),
  result: vi.fn(async () => ({ data: { rig_task_id: "rig-task", rigged_character_glb: { url: "https://fal.media/rig.glb" }, rigged_character_fbx: { url: "https://fal.media/rig.fbx" } } })),
} } }));
vi.mock("@/lib/storage/persist-remote", () => ({ persistRemoteAsset: vi.fn(async ({ kind }: { kind: string }) => {
  const id = `output-${kind}`; const row = { id, localPath: state.glb, kind, mimeType: "model/gltf-binary", sourceUrl: `https://fal.media/rig.${kind}`, url: "", originalFileName: `rig.${kind}` }; state.rows.set(id, row); return row;
}) }));
import { executeCharacterJob } from "@/lib/character/jobs";
afterAll(async () => { if (state.root) await rm(state.root, { recursive: true, force: true }); });
describe("mocked character job execution", () => {
  it("persists all rig artifacts and inspects actual joints without network", async () => {
    state.root = resolve("tmp/unit-character-job"); await mkdir(state.root, { recursive: true });
    state.glb = join(state.root, "rig.glb");
    const json = Buffer.from(JSON.stringify({ nodes: [{ name: "mixamorig:Hips" }], skins: [{ joints: [0] }] }).padEnd(128, " "));
    const header = Buffer.alloc(20); header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    await writeFile(state.glb, Buffer.concat([header, json]));
    state.rows.set("input", { id: "input", sourceUrl: "https://fal.media/input.glb", url: "", localPath: state.glb, mimeType: "model/gltf-binary", kind: "glb", originalFileName: "input.glb" });
    const result = await executeCharacterJob("rig", { projectId: "p", nodeId: "n", data: { heightMeters: 1.8 }, meshAssetIds: ["input"], imageAssetIds: [], animationAssetIds: [] }, "job");
    expect(state.calls).toEqual([{ slug: "fal-ai/meshy/rigging", input: { model_url: "https://fal.media/input.glb", height_meters: 1.8, enable_animation: false } }]);
    expect(result.assets.map((a) => a.kind)).toEqual(["glb", "fbx"]);
    expect(result.boneNames).toEqual(["mixamorig:Hips"]);
    expect(result.rigTaskId).toBe("rig-task");
  });
});
