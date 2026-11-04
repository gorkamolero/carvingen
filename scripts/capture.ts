import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCaptureArgs } from "../src/lib/capture/args";
import { captureCanvas, launchCaptureBrowser, waitForCapture } from "../src/lib/capture/browser";
import { safeName, viewerEntries } from "../src/lib/capture/graph";
import { convertVideo, loadingTrim } from "../src/lib/capture/ffmpeg";
import type { ProjectGraph } from "../src/lib/graph/types";
async function main() {
  const { projectId, out, baseUrl, seconds } = parseCaptureArgs(process.argv.slice(2));
  async function get(path: string) { const response = await fetch(`${baseUrl}${path}`); if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`); return response; }
  const graph = await (await get(`/api/projects/${encodeURIComponent(projectId)}`)).json() as ProjectGraph;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "canvas.png"), await captureCanvas(baseUrl, projectId));
  console.log("canvas.png");
  const browser = await launchCaptureBrowser();
  const temporary = await mkdtemp(join(tmpdir(), "carvingen-capture-"));
  try {
    for (const { node, label, asset } of viewerEntries(graph)) {
      if (!asset) { console.log(`Skipping ${label}: no connected output`); continue; }
      const query = new URLSearchParams({ asset, autorotate: "0", exposure: String(node.data.exposure) });
      const url = `${baseUrl}/capture/viewer?${query}`;
      const page = await browser.newPage({ viewport: { width: 700, height: 800 }, deviceScaleFactor: 2 });
      await page.route("**/*", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
      await page.goto(url); await waitForCapture(page);
      const clips = await page.locator("model-viewer").evaluate((el) => (el as HTMLElement & { availableAnimations: string[] }).availableAnimations);
      await page.screenshot({ path: join(out, `viewer-${label}.png`) });
      await page.close();
      const names = new Set<string>();
      for (const clip of clips) {
        let name = safeName(clip);
        for (let i = 2; names.has(name); i++) name = `${safeName(clip)}-${i}`;
        names.add(name);
        const context = await browser.newContext({ viewport: { width: 700, height: 800 }, deviceScaleFactor: 1, recordVideo: { dir: temporary, size: { width: 700, height: 800 } } });
        try {
          await context.route("**/*", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
          const videoPage = await context.newPage();
          await videoPage.addInitScript(() => {
            document.addEventListener("DOMContentLoaded", () => {
              const cover = document.createElement("div"); cover.id = "capture-loading-cover";
              cover.style.cssText = "position:fixed;inset:0;background:black;z-index:2147483647";
              document.body.append(cover);
            });
          });
          await videoPage.goto(`${url}&clip=${encodeURIComponent(clip)}`);
          await waitForCapture(videoPage);
          await videoPage.waitForTimeout(1000);
          await videoPage.locator("model-viewer").evaluate((el) => {
            const v = el as HTMLElement & { currentTime: number; play: () => void };
            v.currentTime = 0; v.play(); document.getElementById("capture-loading-cover")?.remove();
          });
          await videoPage.waitForTimeout((seconds + 3) * 1000);
          const video = videoPage.video()!;
          await context.close();
          const destination = join(out, `viewer-${label}-${name}.mp4`);
          const path = await video.path();
          await convertVideo(path, destination, seconds, await loadingTrim(path));
          console.log(destination);
        } finally { await context.close(); }
      }
    }
    if (graph.nodes.some((n) => n.type === "multiview" && Object.keys(n.data.artifactAssetIds).length)) {
      await writeFile(join(out, "multiview-sheet.png"), Buffer.from(await (await get(`/api/capture/${projectId}/sheet`)).arrayBuffer()));
    }
    await writeFile(join(out, "notes.md"), await (await get(`/api/capture/${projectId}/notes`)).text());
    console.log(`Saved capture pack to ${out}`);
  } finally { await browser.close(); await rm(temporary, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
