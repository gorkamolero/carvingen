import type { Browser } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchCaptureBrowser, waitForCapture } from "./browser";
import { convertVideo, loadingTrim, requireVideoTools } from "./ffmpeg";

export const viewerSize = { width: 700, height: 800 };
export type ViewerCaptureOptions = { baseUrl: string; assetId: string; clip?: string; autoRotate?: boolean; exposure?: number; seconds?: number };
function viewerUrl(options: ViewerCaptureOptions) {
  const query = new URLSearchParams({ asset: options.assetId, autorotate: options.autoRotate ? "1" : "0", exposure: String(options.exposure ?? 1) });
  if (options.clip) query.set("clip", options.clip);
  return `${options.baseUrl}/capture/viewer?${query}`;
}
export async function captureViewerStill(options: ViewerCaptureOptions, suppliedBrowser?: Browser) {
  const browser = suppliedBrowser ?? await launchCaptureBrowser();
  const context = await browser.newContext({ viewport: viewerSize, deviceScaleFactor: 2 });
  try {
    await context.route("**/*", route => route.request().method() === "GET" ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(viewerUrl(options)); await waitForCapture(page);
    const clips = await page.locator("model-viewer").evaluate(el => (el as HTMLElement & { availableAnimations: string[] }).availableAnimations);
    return { buffer: await page.screenshot({ type: "png" }), clips };
  } finally { await context.close(); if (!suppliedBrowser) await browser.close(); }
}
export async function captureViewerClip(options: ViewerCaptureOptions, suppliedBrowser?: Browser) {
  await requireVideoTools();
  const browser = suppliedBrowser ?? await launchCaptureBrowser();
  const temporary = await mkdtemp(join(tmpdir(), "carvingen-capture-"));
  try {
    const context = await browser.newContext({ viewport: viewerSize, deviceScaleFactor: 1, recordVideo: { dir: temporary, size: viewerSize } });
    try {
      await context.route("**/*", route => route.request().method() === "GET" ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const cover = document.createElement("div"); cover.id = "capture-loading-cover";
          cover.style.cssText = "position:fixed;inset:0;background:black;z-index:2147483647";
          document.body.append(cover);
        });
      });
      await page.goto(viewerUrl(options)); await waitForCapture(page);
      await page.waitForTimeout(1000);
      await page.locator("model-viewer").evaluate(el => {
        const viewer = el as HTMLElement & { currentTime: number; play: () => void };
        viewer.currentTime = 0; viewer.play(); document.getElementById("capture-loading-cover")?.remove();
      });
      const seconds = options.seconds ?? 10;
      await page.waitForTimeout((seconds + 3) * 1000);
      const video = page.video()!;
      await context.close();
      const input = await video.path(), output = join(temporary, "capture.mp4");
      await convertVideo(input, output, seconds, await loadingTrim(input));
      return await readFile(output);
    } finally { await context.close(); }
  } finally { if (!suppliedBrowser) await browser.close(); await rm(temporary, { recursive: true, force: true }); }
}
