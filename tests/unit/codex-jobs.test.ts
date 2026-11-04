// @vitest-environment node
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const state = vi.hoisted(() => ({ root: "", row: undefined as undefined | { id: string; providerSlug: string; state: string }, reused: false }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ ASSET_STORAGE_PATH: state.root }) }));
vi.mock("@/lib/db/repositories/jobs", () => ({
  createJob: vi.fn(async () => { state.row = { id: "job", providerSlug: "codex/gpt-image", state: "queued" }; return { jobId: "job" }; }),
  getJobById: vi.fn(async () => state.row), getActiveJobsByProject: vi.fn(), updateJobProgress: vi.fn(),
  completeJob: vi.fn(async ({ state: status }) => { if (state.row) state.row.state = status; }),
}));
vi.mock("@/lib/db/repositories/assets", () => ({
  getAssetById: vi.fn(async () => ({ localPath: "reference.png", mimeType: "image/png" })),
  getAssetBySha: vi.fn(async () => state.reused ? { id: "existing" } : null),
  createAssetRecord: vi.fn(async () => ({ id: "image" })),
}));
vi.mock("@/lib/codex/image", () => ({ generateCodexImage: vi.fn(async () => {
  const file = resolve(state.root, "output.png"); await writeFile(file, "mocked PNG"); return file;
}) }));
import { POST } from "@/app/api/jobs/route";
import { reconcileCodexJob, startCodexJob } from "@/lib/codex/jobs";
import { completeJob, createJob } from "@/lib/db/repositories/jobs";
import { createAssetRecord } from "@/lib/db/repositories/assets";
import { generateCodexImage } from "@/lib/codex/image";
const request = { projectId: "p", nodeId: "n", provider: "local", providerSlug: "codex/gpt-image", requestInput: { prompt: "apple", aspectRatio: "1:1", referenceAssetIds: ["ref"] } };
beforeEach(async () => { vi.clearAllMocks(); state.reused = false; state.root = resolve("tmp/unit-codex-job"); await mkdir(state.root, { recursive: true }); });
afterAll(async () => { await rm(state.root, { recursive: true, force: true }); });
it("routes a local job, resolves references, and persists the generated image", async () => {
  const response = await POST(new Request("http://localhost/api/jobs", { method: "POST", body: JSON.stringify(request) }));
  expect(response.status).toBe(201);
  await vi.waitFor(() => expect(completeJob).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded", outputAssetIds: ["image"] })));
  expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ provider: "local", providerJobId: expect.stringMatching(/^server-managed:/) }));
  expect(generateCodexImage).toHaveBeenCalledWith(expect.objectContaining({ referencePaths: ["reference.png"], workDir: resolve(state.root, "codex-jobs/job") }));
  expect(createAssetRecord).toHaveBeenCalledWith(expect.objectContaining({ kind: "image", mimeType: "image/png" }));
});
it("reuses byte-identical image assets", async () => {
  state.reused = true; await startCodexJob(request);
  await vi.waitFor(() => expect(completeJob).toHaveBeenCalledWith(expect.objectContaining({ outputAssetIds: ["existing"] })));
  expect(createAssetRecord).not.toHaveBeenCalled();
});
it("marks interrupted jobs failed after a server restart", async () => {
  state.row = { id: "interrupted", providerSlug: "codex/gpt-image", state: "running" };
  await reconcileCodexJob("interrupted");
  expect(completeJob).toHaveBeenCalledWith(expect.objectContaining({ state: "failed", error: expect.stringContaining("Server restarted") }));
});
