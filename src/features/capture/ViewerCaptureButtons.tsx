"use client";
import { useRef, useState } from "react";
import type { ModelElement } from "@/lib/capture/model";
import { graphHistory, updateViewerNode } from "@/lib/graph/store";
import { requestViewerCapture, type SavedCapture } from "@/lib/capture/client";
import { getIncomingGlbAssetId } from "@/lib/graph/selectors";
import { fetchJson } from "@/lib/api/client";
export function ViewerCaptureButtons({ nodeId }: { nodeId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  async function capture(record: boolean) {
    const viewer = ref.current?.closest('[data-testid="viewer-node"]')?.querySelector("model-viewer") as ModelElement | null;
    if (!viewer?.loaded) { setError("Wait for the model to load."); return; }
    setBusy(record ? "Recording 10 s…" : "Saving still…"); setError("");
    try {
      const graph = graphHistory.value;
      const assetId = getIncomingGlbAssetId(nodeId, graph.nodes, graph.edges);
      if (!graph.activeProjectId || !assetId) throw new Error("No connected model to capture.");
      let saved: SavedCapture | null = await requestViewerCapture(record, {
        projectId: graph.activeProjectId, nodeId, assetId, clip: viewer.animationName || undefined,
        autoRotate: viewer.hasAttribute("auto-rotate"), exposure: Number(viewer.getAttribute("exposure") ?? 1), seconds: 10,
      });
      if (!saved) {
        let blob: Blob;
        if (record) {
          const modelClass = viewer.constructor as typeof HTMLElement & { minimumRenderScale: number };
          const previousScale = modelClass.minimumRenderScale;
          const canvas = viewer.shadowRoot?.querySelector("canvas");
          if (!canvas?.captureStream || typeof MediaRecorder === "undefined") throw new Error("Canvas recording is unavailable in this browser. Use pnpm capture.");
          const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
          if (!mimeType) throw new Error("WebM recording is unavailable. Use pnpm capture.");
          modelClass.minimumRenderScale = 1;
          let stream: MediaStream | undefined;
          const wasPaused = viewer.paused;
          try {
            await new Promise((resolve) => setTimeout(resolve, 500));
            stream = canvas.captureStream(30);
            viewer.play();
            blob = await new Promise<Blob>((resolve, reject) => {
              const recorder = new MediaRecorder(stream!, { mimeType });
              const chunks: Blob[] = [];
              const timer = setTimeout(() => recorder.stop(), 10_000);
              recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
              recorder.onerror = () => { clearTimeout(timer); reject(new Error("Recording failed.")); };
              recorder.onstop = () => { clearTimeout(timer); resolve(new Blob(chunks, { type: "video/webm" })); };
              recorder.start();
            });
          } finally { stream?.getTracks().forEach((track) => track.stop()); modelClass.minimumRenderScale = previousScale; if (wasPaused) viewer.pause(); }
        } else {
          // Render at twice the displayed CSS size, then restore the live node.
          const original = viewer.style.cssText;
          const modelClass = viewer.constructor as typeof HTMLElement & { minimumRenderScale: number };
          const originalScale = modelClass.minimumRenderScale;
          const bounds = viewer.getBoundingClientRect();
          try {
            modelClass.minimumRenderScale = 1;
            viewer.style.width = `${Math.ceil(bounds.width * 2)}px`;
            viewer.style.height = `${Math.ceil(bounds.height * 2)}px`;
            viewer.style.flex = "none";
            await new Promise((resolve) => setTimeout(resolve, 300));
            blob = await viewer.toBlob({ mimeType: "image/png", idealAspect: false });
          } finally { viewer.style.cssText = original; modelClass.minimumRenderScale = originalScale; }
        }
        const body = new FormData(); body.append("file", blob, record ? "capture.webm" : "capture.png");
        saved = await fetchJson<{ assetId: string; extension: string; conversionWarning?: string }>("/api/capture/media", { method: "POST", body });
      }
      const node = graphHistory.value.nodes.find((n) => n.id === nodeId);
      if (node?.type === "viewer") updateViewerNode(nodeId, { captureAssetIds: [...new Set([...(node.data.captureAssetIds ?? []), saved.assetId])] });
      const a = document.createElement("a"); a.href = `/api/assets/${encodeURIComponent(saved.assetId)}`; a.download = `viewer-${nodeId}.${saved.extension}`; a.click();
      if (saved.conversionWarning) setError(saved.conversionWarning);
    } catch (e) { setError(e instanceof Error ? e.message : "Capture failed"); }
    finally { setBusy(""); }
  }
  const node = graphHistory.value.nodes.find((n) => n.id === nodeId);
  const history = node?.type === "viewer" ? node.data.captureAssetIds ?? [] : [];
  return <div ref={ref} className="nodrag nopan space-y-1 text-xs"><div className="flex gap-2"><button className="border-2 border-black bg-white p-1 disabled:opacity-50" disabled={!!busy} onClick={() => void capture(false)}>{busy === "Saving still…" ? busy : "Save still"}</button><button className="border-2 border-black bg-white p-1 disabled:opacity-50" disabled={!!busy} onClick={() => void capture(true)}>{busy.startsWith("Recording") ? busy : "Record"}</button></div>{error && <p role="alert">{error}</p>}{history.length > 0 && <details><summary>Captures · {history.length}</summary>{history.map((id, i) => <a className="block" key={`${id}-${i}`} href={`/api/assets/${encodeURIComponent(id)}`} download>Capture {i + 1}</a>)}</details>}</div>;
}
