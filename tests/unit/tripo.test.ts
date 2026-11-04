// @vitest-environment node
import { describe, expect, it, vi, afterEach } from "vitest";
import { TripoClient, buildTripoRigRequest, buildTripoRetargetRequest, tripoArtifact } from "@/lib/tripo/client";
import { animationPresets, TRIPO_PRESET_IDS } from "@/lib/tripo/presets";
import { createPipelineData } from "@/lib/character/schema";
import { characterInputs, resultPatch } from "@/lib/character/client";
import { estimateNodeCost } from "@/lib/fal/pricing";
import type { CarvingNode, CarvingEdge } from "@/lib/graph/types";

const response = (data: unknown) => new Response(JSON.stringify({ code: 0, data }));
afterEach(() => vi.unstubAllEnvs());
describe("Tripo native API", () => {
  it("requires a key before any network request", () => {
    vi.stubEnv("TRIPO_API_KEY", "");
    expect(() => new TripoClient()).toThrow("Set TRIPO_API_KEY to use Tripo rigging");
  });
  it("builds v3 Mixamo and single-preset requests", () => {
    expect(buildTripoRigRequest("file_a")).toEqual({ input: "file_a", model: "v3.0-20260909", rig_type: "biped", spec: "mixamo", out_format: "glb" });
    expect(buildTripoRetargetRequest("rig_a", "preset:walk")).toEqual({ input: "rig_a", animation: "preset:walk", out_format: "glb", export_with_geometry: true });
  });
  it("uploads multipart GLB, checks it, rigs it and converts its output", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ file_token: "file_a" }))
      .mockResolvedValueOnce(response({ task_id: "check" }))
      .mockResolvedValueOnce(response({ task_id: "check", status: "success", output: { riggable: true, rig_type: "biped" } }))
      .mockResolvedValueOnce(response({ task_id: "rig" }))
      .mockResolvedValueOnce(response({ task_id: "rig", status: "success", output: { model_url: "https://cdn.tripo3d.ai/a.glb" } }))
      .mockResolvedValueOnce(response({ task_id: "fbx" }))
      .mockResolvedValueOnce(response({ task_id: "fbx", status: "success", output: { model_url: "https://cdn.tripo3d.ai/converted" } }));
    const onTask = vi.fn().mockResolvedValue(undefined);
    const client = new TripoClient({ apiKey: "test", fetch: fetcher, pauseMs: 0, onTask });
    const token = await client.uploadGlb(new Uint8Array([1, 2, 3]));
    await client.rigCheck(token);
    const rig = await client.rig(token);
    const fbx = await client.convertFbx(rig.output!.model_url!);
    const upload = fetcher.mock.calls[0];
    expect(upload[0]).toBe("https://openapi.tripo3d.ai/v3/files");
    expect(upload[1]?.headers).toEqual({ Authorization: "Bearer test" });
    expect((upload[1]?.body as FormData).get("file")).toMatchObject({ name: "model.glb", size: 3 });
    expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string)).toEqual({ input: "file_a" });
    expect(JSON.parse(fetcher.mock.calls[5][1]?.body as string)).toEqual({ input: "https://cdn.tripo3d.ai/a.glb", format: "FBX", with_animation: true });
    expect(tripoArtifact(fbx, "fbx", "rigged")).toEqual({ name: "rigged-fbx", kind: "fbx", sourceUrl: "https://cdn.tripo3d.ai/converted" });
    expect(onTask).toHaveBeenCalledTimes(3);
  });
  it.each([{ riggable: false, rig_type: "biped" }, { riggable: true, rig_type: "quadruped" }])("rejects incompatible rigs: %j", async (output) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ task_id: "check" })).mockResolvedValueOnce(response({ status: "success", output }));
    await expect(new TripoClient({ apiKey: "test", fetch: fetcher }).rigCheck("file_a")).rejects.toThrow("not riggable as a biped");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries dropped polls without resubmitting", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ task_id: "clip" })).mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(response({ status: "running", progress: 50 })).mockResolvedValueOnce(response({ task_id: "clip", status: "success", output: { model_url: "https://cdn.tripo3d.ai/clip.glb" } }));
    const result = await new TripoClient({ apiKey: "test", fetch: fetcher, pauseMs: 0 }).retarget("rig", "preset:walk");
    expect(result.task_id).toBe("clip");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://openapi.tripo3d.ai/v3/animations/retarget");
  });
  it("preserves provider failure messages and never retries creation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ status: "failed", error_message: "Cannot find limbs" }));
    await expect(new TripoClient({ apiKey: "test", fetch: fetcher }).poll("bad", "Rig")).rejects.toThrow("Cannot find limbs");
    fetcher.mockReset().mockRejectedValue(new TypeError("fetch failed"));
    await expect(new TripoClient({ apiKey: "test", fetch: fetcher }).rig("file")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds polling and rejects missing output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ status: "unknown" }));
    await expect(new TripoClient({ apiKey: "test", fetch: fetcher, maxPolls: 2, pauseMs: 0 }).poll("pending", "Rig")).rejects.toThrow("polling timed out");
    expect(() => tripoArtifact({ task_id: "x", status: "success" }, "glb", "rig")).toThrow("no usable glb");
  });
  it("switches preset library and prices from completed rig provenance", () => {
    expect(animationPresets("tripo").map((p) => p.id)).toEqual([...TRIPO_PRESET_IDS]);
    expect(animationPresets("meshy")[0].id).toBeTypeOf("number");
    const patch = resultPatch({ assets: [], outputAssetId: "rig-glb", rigEngine: "tripo", tripoRigTaskId: "rig-task" }, { outputAssetIds: [] });
    const rig: CarvingNode = { id: "rig", type: "rig", position: { x: 0, y: 0 }, data: { ...createPipelineData("rig"), ...patch } };
    const animate: CarvingNode = { id: "animate", type: "animate", position: { x: 0, y: 0 }, data: createPipelineData() };
    const edges = [{ id: "edge", source: "rig", target: "animate", targetHandle: "glb-in" }] as CarvingEdge[];
    expect(characterInputs(animate, [rig, animate], edges)).toMatchObject({ inputRigEngine: "tripo", inputTripoRigTaskId: "rig-task", meshAssetIds: ["rig-glb"] });
    expect(estimateNodeCost({ type: "rig", data: { ...rig.data, engine: "tripo" } }).usd).toBe(0.3);
    expect(estimateNodeCost({ type: "animate", data: { ...animate.data, rigEngine: "tripo" } }).usd).toBe(0.3);
    expect(createPipelineData("rig").engine).toBe("meshy");
    expect(resultPatch({ assets: [], outputAssetId: "meshy" }, { outputAssetIds: [] }).tripoRigTaskId).toBeNull();
  });
});
