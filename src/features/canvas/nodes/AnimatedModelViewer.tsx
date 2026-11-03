"use client";
import { useEffect, useRef, useState } from "react";
type ModelElement = HTMLElement & { availableAnimations: string[]; animationName: string; play: () => void; pause: () => void };
export function AnimatedModelViewer({ src, autoRotate, exposure }: { src: string; autoRotate: boolean; exposure: number }) {
  const ref = useRef<ModelElement | null>(null);
  const [clips, setClips] = useState<string[]>([]), [selected, setSelected] = useState(""), [playing, setPlaying] = useState(true);
  useEffect(() => {
    const viewer = ref.current;
    const loaded = () => { const names = viewer?.availableAnimations ?? []; setClips(names); setSelected(names[0] ?? ""); setPlaying(true); viewer?.play(); };
    viewer?.addEventListener("load", loaded);
    return () => viewer?.removeEventListener("load", loaded);
  }, [src]);
  return <div className="h-full flex flex-col"><model-viewer ref={ref} src={src} camera-controls interaction-prompt="none" auto-rotate={autoRotate ? "" : undefined} exposure={String(exposure)} animation-name={selected} autoplay="" environment-image="neutral" shadow-intensity="1" class="nodrag nopan nowheel" style={{ width: "100%", flex: 1, minHeight: 0, background: "#fafaf5" }} />
    {clips.length > 0 && <div className="nodrag flex gap-2 bg-white p-1 text-xs"><select aria-label="Animation clip" value={selected} onChange={(e) => { setSelected(e.target.value); if (ref.current) { ref.current.animationName = e.target.value; ref.current.play(); setPlaying(true); } }}>{clips.map((c) => <option key={c}>{c}</option>)}</select><button onClick={() => { if (playing) ref.current?.pause(); else ref.current?.play(); setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</button></div>}
  </div>;
}
