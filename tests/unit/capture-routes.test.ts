// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  still: vi.fn(), clip: vi.fn(), load: vi.fn(), asset: vi.fn(), save: vi.fn(), write: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/capture/viewer", () => ({ captureViewerStill: mocks.still, captureViewerClip: mocks.clip }));
vi.mock("@/lib/db/client", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/db/repositories/projects", () => ({ loadProject: mocks.load }));
vi.mock("@/lib/db/repositories/assets", () => ({ getAssetById: mocks.asset, getAssetBySha: vi.fn(async () => null), createAssetRecord: mocks.save }));
vi.mock("@/lib/storage/files", () => ({ writeFileIfMissing: mocks.write }));
vi.mock("@/lib/storage/paths", () => ({ buildAssetPath: () => "/tmp/mock.png" }));
import { POST as still } from "@/app/api/capture/viewer-still/route";
import { POST as clip } from "@/app/api/capture/viewer-clip/route";
import { queueCapture } from "@/lib/capture/queue";
import { CaptureUnavailableError } from "@/lib/capture/errors";
const input = { projectId: "project", nodeId: "viewer", assetId: "model", clip: "Walk", autoRotate: true, seconds: 10 };
const request = (body: unknown) => new Request("http://localhost:3005/api/capture/viewer-still", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ nodes: [{ id: "viewer", type: "viewer", data: { exposure: 1, autoRotate: false } }] });
  mocks.asset.mockResolvedValue({ mimeType: "model/gltf-binary" });
  mocks.save.mockResolvedValue({ id: "saved" });
  mocks.still.mockResolvedValue({ buffer: Buffer.from("png") });
  mocks.clip.mockResolvedValue(Buffer.from("mp4"));
});
it.each([{ ...input, seconds: 0 }, { ...input, seconds: 301 }, { ...input, autoRotate: "yes" }, { ...input, projectId: "../x" }, { nodeId: "viewer" }])("rejects invalid input %j", async body => {
  expect((await still(request(body))).status).toBe(400);
  expect(mocks.still).not.toHaveBeenCalled();
});
it.each([[still, "still"], [clip, "clip"]] as const)("uses shared renderer and saves an asset", async (route, kind) => {
  const response = await route(request(input));
  expect(response.status).toBe(200);
  expect(kind === "still" ? mocks.still : mocks.clip).toHaveBeenCalledWith(expect.objectContaining({ ...input, baseUrl: "http://localhost:3005", exposure: 1 }));
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ width: kind === "still" ? 1400 : 700, height: kind === "still" ? 1600 : 800 }));
  expect(mocks.transaction).toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ assetId: "saved" });
});
it("reports dependency errors with distinct codes", async () => {
  mocks.still.mockRejectedValueOnce(new CaptureUnavailableError("PLAYWRIGHT_UNAVAILABLE", "Install Chromium"));
  expect(await (await still(request(input))).json()).toMatchObject({ code: "PLAYWRIGHT_UNAVAILABLE" });
  mocks.clip.mockRejectedValueOnce(new CaptureUnavailableError("FFMPEG_UNAVAILABLE", "Install ffmpeg"));
  expect(await (await clip(request(input))).json()).toMatchObject({ code: "FFMPEG_UNAVAILABLE" });
});
it("serializes work and recovers after rejection", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  const first = queueCapture(async () => { events.push("first"); await gate; throw new Error("failed"); });
  const rejection = expect(first).rejects.toThrow("failed");
  const second = queueCapture(async () => { events.push("second"); });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(events).toEqual(["first"]);
  release(); await rejection; await second;
  expect(events).toEqual(["first", "second"]);
});
