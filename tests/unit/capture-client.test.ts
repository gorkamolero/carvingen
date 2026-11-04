import { afterEach, expect, it, vi } from "vitest";
import { requestViewerCapture } from "@/lib/capture/client";
const input = { projectId: "p", nodeId: "n", assetId: "a", clip: "Walk", autoRotate: true, exposure: 1, seconds: 10 };
afterEach(() => vi.unstubAllGlobals());
it("sends current viewer settings and returns the saved capture", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ assetId: "saved", extension: "mp4" }));
  vi.stubGlobal("fetch", fetch);
  expect(await requestViewerCapture(true, input)).toEqual({ assetId: "saved", extension: "mp4" });
  expect(fetch).toHaveBeenCalledWith("/api/capture/viewer-clip", expect.objectContaining({ body: JSON.stringify(input) }));
});
it("allows browser fallback only for Playwright unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "PLAYWRIGHT_UNAVAILABLE" }, { status: 503 })));
  expect(await requestViewerCapture(false, input)).toBeNull();
});
it.each(["FFMPEG_UNAVAILABLE", "CAPTURE_FAILED"])("does not fall back for %s", async code => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code, error: "failed" }, { status: 503 })));
  await expect(requestViewerCapture(true, input)).rejects.toThrow("failed");
});
