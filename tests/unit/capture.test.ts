import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseCaptureArgs } from "@/lib/capture/args";
import { viewerEntries, currentOutputs } from "@/lib/capture/graph";
import { buildNotes, type CaptureJob } from "@/lib/capture/notes";
import { buildSheet, sheetLayout } from "@/lib/capture/sheet";
import { createMeshNodeData, createViewerNodeData, createPromptNodeData, type ProjectGraph } from "@/lib/graph/types";
import { createPipelineData } from "@/lib/character/schema";
vi.mock("sharp", () => ({ default: vi.fn(() => ({ rotate: vi.fn().mockReturnThis(), resize: vi.fn().mockReturnThis(), png: vi.fn().mockReturnThis(), composite: vi.fn().mockReturnThis(), toBuffer: vi.fn().mockResolvedValue(Buffer.from("png")) })) }));
function fixture(): ProjectGraph {
  return { id: "p", name: "Fixture", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
    { id: "mesh", type: "mesh", position: { x: 0, y: 0 }, data: { ...createMeshNodeData(), provider: "tripo-h31", outputAssetId: "current" } },
    { id: "rig", type: "rig", position: { x: 0, y: 0 }, data: { ...createPipelineData(), engine: "tripo", outputAssetId: "rig-current" } },
    { id: "animate", type: "animate", position: { x: 0, y: 0 }, data: { ...createPipelineData(), outputAssetId: "animation-current" } },
    ...["v1", "v2"].map((id) => ({ id, type: "viewer" as const, position: { x: 0, y: 0 }, data: createViewerNodeData() })),
  ], edges: ["v1", "v2"].map((target) => ({ id: target, source: "mesh", target, sourceHandle: "glb-out", targetHandle: "glb-in" })) };
}
function job(nodeId: string, output: string, settings: object, result: object = {}): CaptureJob {
  return { id: output, nodeId, provider: "local", providerSlug: `character/${nodeId}`, state: "succeeded", requestJson: JSON.stringify({ data: settings }), responseSummaryJson: JSON.stringify(result), outputAssetIdsJson: JSON.stringify([output]), startedAt: 1 };
}
describe("capture", () => {
  it("parses defaults and rejects malformed flags", () => {
    expect(parseCaptureArgs(["p"]).seconds).toBe(16);
    expect(parseCaptureArgs(["p", "--seconds", "2.5", "--base-url", "http://localhost:3005/"]).baseUrl).toBe("http://localhost:3005");
    for (const args of [[], ["p", "--out"], ["p", "--seconds", "0"], ["p", "--seconds", "NaN"], ["p", "--bad", "x"], ["../p"]]) expect(() => parseCaptureArgs(args)).toThrow();
  });
  it("labels repeated upstream kinds deterministically", () => {
    expect(viewerEntries(fixture()).map((e) => e.label)).toEqual(["mesh", "mesh-2"]);
    expect(currentOutputs(fixture().nodes[0])).toEqual(["current"]);
  });
  it("matches current outputs, uses recorded settings, and reports costs and counts", () => {
    const graph = fixture();
    const notes = buildNotes(graph, [job("mesh", "old", { provider: "tripo-p2" }, { triangleCount: 999 }), job("mesh", "current", { provider: "tripo-h31", tripoTexture: true }, { triangleCount: 12000 }), job("rig", "rig-current", { engine: "tripo" }, { credits: 50, boneNames: ["Hips", "LeftThumb", "RightIndex"] }), job("animate", "animation-current", { presetIds: [0] }, { clips: [{ name: "Idle", duration: 2, frameCount: 60 }] })]);
    expect(notes).toContain("$0.30"); expect(notes).toContain("$0.50"); expect(notes).toContain("$0.32");
    expect(notes).toContain("12000"); expect(notes).not.toContain("999"); expect(notes).toContain("Bones 3 · finger bones 2"); expect(notes).toContain("Idle · 2 s · 60 frames"); expect(notes).toContain("$1.12");
  });
  it("prices legacy fal requests from the recorded provider slug", () => {
    const graph = fixture();
    graph.nodes = [{ id: "prompt", type: "prompt", position: { x: 0, y: 0 }, data: { ...createPromptNodeData(), outputAssetIds: ["image"] } }];
    const row = job("prompt", "image", { num_images: 1 });
    row.provider = "fal"; row.providerSlug = "fal-ai/nano-banana-2/edit";
    expect(buildNotes(graph, [row])).toContain("$0.08");
  });
  it("reports Codex and local costs as zero and absent counts as unavailable", () => {
    const graph = fixture();
    const row = job("mesh", "current", {}); row.providerSlug = "local/convert";
    expect(buildNotes(graph, [row])).toContain("$0.00 · local");
    row.provider = "codex";
    expect(buildNotes(graph, [row])).toContain("$0.00 · Codex");
    expect(buildNotes(graph, [row])).toContain("unavailable in job result");
  });
  it("lays out input and views horizontally and rejects empty sheets", async () => {
    expect(sheetLayout(4)).toEqual({ width: 2400, height: 680, cellWidth: 600, labelHeight: 80 });
    expect(await buildSheet([{ label: "<Input>", buffer: Buffer.from("image") }])).toEqual(Buffer.from("png"));
    await expect(buildSheet([])).rejects.toThrow("No images");
  });
  it("keeps capture pages independent of saving, job polling, and the mutable graph store", () => {
    for (const file of ["src/features/capture/CaptureCanvas.tsx", "src/features/capture/CaptureViewer.tsx", "src/app/capture/viewer/page.tsx", "src/app/capture/canvas/[id]/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\/save|saveProject|graph\/store|CanvasScreen|pollCharacterJob|useMutation/);
    }
  });
});

import { cardLines } from "@/features/capture/CaptureCanvas";
describe("capture canvas cards", () => {
  it("show only the settings of each node kind", () => {
    const shared = { imageModel: "fal-ai/nano-banana-2", presetIds: [0, 669], engine: "blender", targetTriangles: 18000, textureSize: 2048, turnDegrees: 270, triangleCount: 17999 };
    expect(cardLines("bake", shared)).toEqual(["Engine · blender", "Target · 18,000 triangles", "Texture · 2048px", "Turn · 270°", "Result · 17,999 triangles"]);
    expect(cardLines("rig", { ...shared, engine: "tripo", boneNames: ["Hips", "LeftThumbProximal", "LeftIndexDistal"] })).toEqual(["Engine · tripo", "Bones · 3 (2 finger)"]);
    expect(cardLines("animate", { ...shared, rigEngine: "tripo", tripoPresetIds: ["preset:idle", "preset:walk"], inPlace: true })).toEqual(["Engine · tripo", "Clips · idle, walk", "In place"]);
  });
});
