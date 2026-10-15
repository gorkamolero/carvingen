import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/repositories/assets", () => ({
  createAssetRecord: vi.fn((input) => ({ ...input, url: `/api/assets/${input.id}` })),
  getAssetBySha: vi.fn(() => null),
}));

vi.mock("@/lib/storage/files", () => ({
  writeFileIfMissing: vi.fn(),
}));

import { createAssetRecord, getAssetBySha } from "@/lib/db/repositories/assets";
import {
  isAllowedPersistedKind,
  isAllowedRemoteAssetHost,
  persistRemoteAsset,
} from "@/lib/storage/persist-remote";
import { writeFileIfMissing } from "@/lib/storage/files";

describe("remote asset persistence boundary", () => {
  it("accepts Hunyuan material and texture artifacts", () => {
    expect(isAllowedPersistedKind("mtl")).toBe(true);
    expect(isAllowedPersistedKind("texture")).toBe(true);
  });
  beforeEach(() => {
    vi.mocked(createAssetRecord).mockClear();
    vi.mocked(getAssetBySha).mockClear();
    vi.mocked(writeFileIfMissing).mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("persists an allowed provider URL and image kind", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "3",
        },
      }),
    );

    const asset = await persistRemoteAsset({
      sourceUrl: "https://v3.fal.media/files/carving-output.png",
      kind: "image",
      jobId: "job_123",
    });

    expect(asset?.kind).toBe("image");
    expect(asset?.jobId).toBe("job_123");
    expect(fetch).toHaveBeenCalledWith("https://v3.fal.media/files/carving-output.png");
    expect(writeFileIfMissing).toHaveBeenCalledOnce();
  });

  it("accepts the FBX content type fal reports for Meshy exports", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "application/vnd.autodesk.fbx", "content-length": "3" },
      }),
    );

    const asset = await persistRemoteAsset({
      sourceUrl: "https://v3.fal.media/files/model.fbx",
      kind: "fbx",
    });

    expect(asset?.kind).toBe("fbx");
  });

  it("rejects local or private URLs before fetching", async () => {
    await expect(
      persistRemoteAsset({
        sourceUrl: "http://localhost:3001/private.png",
        kind: "image",
      }),
    ).rejects.toThrow(/https/i);

    await expect(
      persistRemoteAsset({
        sourceUrl: "https://192.168.0.4/private.png",
        kind: "image",
      }),
    ).rejects.toThrow(/private or local/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unknown asset kinds", async () => {
    expect(isAllowedPersistedKind("prompt-log")).toBe(false);

    await expect(
      persistRemoteAsset({
        sourceUrl: "https://v3.fal.media/files/output.txt",
        kind: "prompt-log",
      }),
    ).rejects.toThrow(/unsupported remote asset kind/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized content-length before buffering", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": `${101 * 1024 * 1024}`,
        },
      }),
    );

    await expect(
      persistRemoteAsset({
        sourceUrl: "https://v3.fal.media/files/huge.png",
        kind: "image",
      }),
    ).rejects.toThrow(/exceeds/i);

    expect(writeFileIfMissing).not.toHaveBeenCalled();
  });

  it("enforces final buffer size when content-length is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array(101 * 1024 * 1024), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    );

    await expect(
      persistRemoteAsset({
        sourceUrl: "https://v3.fal.media/files/huge-without-length.png",
        kind: "image",
      }),
    ).rejects.toThrow(/exceeds/i);

    expect(writeFileIfMissing).not.toHaveBeenCalled();
  });

  it("matches allowed hosts by exact host or subdomain only", () => {
    expect(isAllowedRemoteAssetHost("v3.fal.media", "fal.media")).toBe(true);
    expect(isAllowedRemoteAssetHost("assets.v3.fal.media", "fal.media")).toBe(true);
    expect(isAllowedRemoteAssetHost("notfal.media.example.com", "fal.media")).toBe(false);
  });
});
