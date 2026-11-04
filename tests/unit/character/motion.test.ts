import { describe, it, expect, vi } from "vitest";
import { createPipelineData, pipelineDataSchema } from "@/lib/character/schema";
import { motionSlug } from "@/lib/character/motion";
import { canConnectNodes } from "@/lib/graph/connections";
import { characterInputs, resultPatch } from "@/lib/character/client";
import { buildMotionVideoRequest, CHARACTER_ENDPOINTS } from "@/lib/character/fal";
import { estimateNodeCost } from "@/lib/fal/pricing";
import { FAL_ALLOWED_ENDPOINTS } from "@/lib/fal/proxy-config";
import type { CarvingNode } from "@/lib/graph/types";
vi.mock("@fal-ai/client", () => ({ fal: { queue: { submit: vi.fn(() => { throw new Error("Paid generation is forbidden in tests"); }) } } }));
vi.mock("@fal-ai/server-proxy/nextjs", () => ({ createRouteHandler: vi.fn() }));
describe("Motion", () => {
  it("defaults and bounds", () => {
    expect(createPipelineData("motion")).toMatchObject({ moveName: "Paddle", firstPose: "standing", actionSentence: "", clipSeconds: 3.5, takeBudget: 6, seedBase: null, motionReport: null });
    for (const clipSeconds of [2.9, 4.1]) expect(() => pipelineDataSchema.parse({ clipSeconds })).toThrow();
    for (const takeBudget of [0, 13]) expect(() => pipelineDataSchema.parse({ takeBudget })).toThrow();
    expect(motionSlug("Paddle Stroke")).toBe("paddle-stroke");
  });
  it.each([["rig", "motion", true], ["motion", "export", true], ["motion", "viewer", true], ["image", "motion", false]])("connects %s to %s: %s", (source, target, expected) => {
    expect(canConnectNodes({ source: "a", target: "b", sourceHandle: "glb-out", targetHandle: "glb-in" }, source as string, target as string)).toBe(expected);
  });
  it("passes Motion clips to Export", () => {
    const source: CarvingNode = { id: "a", type: "motion", position: { x: 0, y: 0 }, data: { ...createPipelineData(), outputAssetId: "clip", artifactAssetIds: { "animations-motion-paddle-glb": "clip" } } };
    const target: CarvingNode = { id: "b", type: "export", position: { x: 0, y: 0 }, data: createPipelineData() };
    expect(characterInputs(target, [source, target], [{ id: "edge", source: "a", target: "b", sourceHandle: "glb-out", targetHandle: "glb-in" }]).meshAssetIds).toEqual(["clip"]);
  });
  it("validates the exact request and endpoint", () => {
    expect(buildMotionVideoRequest("https://fal.media/ref.png", "Move", 1000)).toEqual({ prompt: "Move", image_url: "https://fal.media/ref.png", duration: 5, resolution: "768P", seed: 1000, prompt_expansion_mode: "disabled" });
    expect(() => buildMotionVideoRequest("http://fal.media/ref.png", "Move", 1)).toThrow();
    expect(() => buildMotionVideoRequest("https://fal.media/ref.png", " ", 1)).toThrow();
    expect(() => buildMotionVideoRequest("https://fal.media/ref.png", "Move", 1.2)).toThrow();
    expect(FAL_ALLOWED_ENDPOINTS).toContain(CHARACTER_ENDPOINTS.motionVideo);
  });
  it("estimates the budget and carries reports", () => {
    expect(estimateNodeCost({ type: "motion", data: createPipelineData() })).toEqual({ usd: 1.68, label: "up to ~$1.68 · 6 takes" });
    const motion = { layout: { width: 1536 as const, height: 768 as const, metresInFrame: 2.2 as const, groundRow: 656 as const }, scale: 2, nativeHeight: .9, seedBase: 1000, prompt: "Move", reference: { assetId: "ref" }, steps: [], takes: [], chosenTake: null, totalUsd: .28 };
    expect(resultPatch({ assets: [], outputAssetId: null, motion, lastRunCost: .28 }, { outputAssetIds: [] })).toMatchObject({ motionReport: motion, lastRunCost: .28 });
  });
});

vi.mock("@/lib/character/motion-env", () => ({ ensureMotionPython: vi.fn(async () => "test-python") }));
vi.mock("@/lib/character/blender", () => ({ runMotionStage: vi.fn() }));
it("retains failed takes, stops on the first pass and accounts for submitted spend", async () => {
  const { mkdir, mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { resolve, join } = await import("node:path");
  const { runMotionJob } = await import("@/lib/character/motion-job");
  const { runMotionStage } = await import("@/lib/character/blender");
  await mkdir("tmp", { recursive: true }); const directory = await mkdtemp(resolve("tmp/motion-job-test-"));
  const stages: string[] = [];
  vi.mocked(runMotionStage).mockImplementation(async (name, _args, output) => {
    stages.push(name); await mkdir(output, { recursive: true });
    if (name === "reference") return { files: [], scale: 2, nativeHeight: .9 };
    if (name === "prompt") { await writeFile(join(output, "prompt.txt"), "Exact vendor prompt"); return { files: [] }; }
    if (name === "gates") return { files: [], pass: !output.includes("take-1"), reasons: output.includes("take-1") ? ["coverage 0.50 < 0.80"] : [] };
    if (name === "apply") return { files: [{ name: "animations-motion-paddle-glb", kind: "glb", path: join(output, "clip.glb") }], pass: true, reasons: [] };
    return { files: [], pass: true, reasons: [] };
  });
  const seeds: number[] = [], saved: string[] = [];
  try {
    const result = await runMotionJob({ directory, input: "unused.glb", data: { ...createPipelineData(), seedBase: 1234 }, progress: async () => {}, save: async (f) => { saved.push(f.name); return f.name; }, video: async (_reference, _prompt, seed, prefix, submitted) => { seeds.push(seed); await submitted(`request-${seed}`); return { assetId: prefix, path: "unused.mp4" }; } });
    expect(seeds).toEqual([1234, 1235]); expect(result.lastRunCost).toBe(.56); expect(result.motion.chosenTake).toBe(2);
    expect(result.motion.takes[0]).toMatchObject({ status: "failed", requestId: "request-1234", reasons: ["coverage 0.50 < 0.80"] });
    expect(stages.filter((s) => s === "solve")).toHaveLength(1); expect(saved).toContain("motion-report");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
