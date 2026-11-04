import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCaptureArgs } from "../src/lib/capture/args";
import { captureCanvas, launchCaptureBrowser } from "../src/lib/capture/browser";
import { safeName, viewerEntries } from "../src/lib/capture/graph";
import { captureViewerStill, captureViewerClip } from "../src/lib/capture/viewer";
import type { ProjectGraph } from "../src/lib/graph/types";
async function main() {
  const { projectId, out, baseUrl, seconds } = parseCaptureArgs(process.argv.slice(2));
  async function get(path: string) { const response = await fetch(`${baseUrl}${path}`); if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`); return response; }
  const graph = await (await get(`/api/projects/${encodeURIComponent(projectId)}`)).json() as ProjectGraph;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "canvas.png"), await captureCanvas(baseUrl, projectId));
  console.log("canvas.png");
  const browser = await launchCaptureBrowser();
  try {
    for (const { node, label, asset } of viewerEntries(graph)) {
      if (!asset) { console.log(`Skipping ${label}: no connected output`); continue; }
      const options = { baseUrl, assetId: asset, autoRotate: false, exposure: node.data.exposure, seconds };
      const { buffer, clips } = await captureViewerStill(options, browser);
      await writeFile(join(out, `viewer-${label}.png`), buffer);
      const names = new Set<string>();
      for (const clip of clips) {
        let name = safeName(clip);
        for (let i = 2; names.has(name); i++) name = `${safeName(clip)}-${i}`;
        names.add(name);
        const destination = join(out, `viewer-${label}-${name}.mp4`);
        await writeFile(destination, await captureViewerClip({ ...options, clip }, browser));
        console.log(destination);
      }
    }
    if (graph.nodes.some((n) => n.type === "multiview" && Object.keys(n.data.artifactAssetIds).length)) {
      await writeFile(join(out, "multiview-sheet.png"), Buffer.from(await (await get(`/api/capture/${projectId}/sheet`)).arrayBuffer()));
    }
    await writeFile(join(out, "notes.md"), await (await get(`/api/capture/${projectId}/notes`)).text());
    console.log(`Saved capture pack to ${out}`);
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
