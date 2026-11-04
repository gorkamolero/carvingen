"use client";
import { useEffect, useRef } from "react";
import { viewerLook, type ModelElement } from "@/lib/capture/model";

export function CaptureViewer({ asset, clip, autoRotate = false, exposure = 1, background = viewerLook.background, onReady, standalone = false }: {
  asset: string; clip?: string; autoRotate?: boolean; exposure?: number; background?: string; onReady?: () => void; standalone?: boolean;
}) {
  const ref = useRef<ModelElement>(null);
  useEffect(() => {
    const viewer = ref.current!;
    let cancelled = false;
    const ready = async () => {
      if (clip && !viewer.availableAnimations.includes(clip)) { window.__captureError = `Clip not found: ${clip}`; return; }
      const modelClass = viewer.constructor as typeof HTMLElement & { minimumRenderScale: number };
      modelClass.minimumRenderScale = 1;
      viewer.animationName = clip ?? viewer.availableAnimations[0] ?? "";
      viewer.currentTime = 0;
      viewer.play();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (!cancelled) { viewer.dataset.captureLoaded = "true"; if (standalone) window.__captureReady = true; onReady?.(); }
    };
    const error = () => { window.__captureError = `Unable to load asset ${asset}`; };
    if (standalone) { window.__captureReady = false; delete window.__captureError; }
    viewer.addEventListener("load", ready);
    viewer.addEventListener("error", error);
    if (viewer.loaded) void ready();
    return () => { cancelled = true; viewer.removeEventListener("load", ready); viewer.removeEventListener("error", error); };
  }, [asset, clip, onReady, standalone]);
  return <model-viewer ref={ref} src={`/api/assets/${encodeURIComponent(asset)}`} loading="eager" reveal="auto" interaction-prompt="none" auto-rotate={autoRotate ? "" : undefined} exposure={String(exposure)} autoplay="" environment-image={viewerLook.environment} shadow-intensity={viewerLook.shadow} style={{ width: "100%", height: "100%", background }}><div slot="progress-bar" style={{ display: "none" }} /></model-viewer>;
}
