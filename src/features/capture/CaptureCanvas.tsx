"use client";
/* eslint-disable @next/next/no-img-element */
import { Background, Handle, Position, ReactFlow, useNodesInitialized, useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { useEffect, useMemo } from "react";
import type { ProjectGraph } from "@/lib/graph/types";
import { getNodeImageAssetId, getIncomingGlbAssetId } from "@/lib/graph/selectors";
import { CaptureViewer } from "./CaptureViewer";
type Card = Node<{ kind: string; asset: string | null; image: string | null; exposure: number; text: string; handles: { id: string; type: "source" | "target" }[] }>;
function CaptureCard({ data }: NodeProps<Card>) {
  return <article style={{ width: data.kind === "viewer" ? 380 : 288, border: "3px solid black", boxShadow: "5px 5px black", background: "#fffdf4" }}>
    {data.handles.map((h, i) => <Handle key={`${h.type}-${h.id}`} id={h.id} type={h.type} position={h.type === "source" ? Position.Right : Position.Left} style={{ top: 30 + i * 20 }} />)}
    <h2 style={{ padding: 12, borderBottom: "3px solid black", background: data.kind === "viewer" ? "#8cff3e" : "#ffd400", fontWeight: 900, textTransform: "uppercase" }}>{data.kind}</h2>
    {data.asset && <div style={{ height: 350 }}><CaptureViewer asset={data.asset} exposure={data.exposure} /></div>}
    {data.image && <img alt={data.kind} src={`/api/assets/${encodeURIComponent(data.image)}`} style={{ width: "100%", height: 250, objectFit: "contain" }} />}
    {data.text && <p style={{ padding: 12, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{data.text}</p>}
  </article>;
}
const types = { capture: CaptureCard };
function Ready({ viewers, empty }: { viewers: number; empty: boolean }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    window.__captureReady = false;
    const timer = setInterval(async () => {
      if ((!initialized && !empty) || document.querySelectorAll('[data-capture-loaded="true"]').length !== viewers || !Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0)) return;
      clearInterval(timer);
      await document.fonts.ready;
      void fitView({ padding: 0.06, minZoom: 0.001, maxZoom: 1 });
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      window.__captureReady = true;
    }, 100);
    return () => { clearInterval(timer); };
  }, [initialized, viewers, empty, fitView]);
  return null;
}
/** Only the settings that matter for each node kind, in plain words. */
export function cardLines(kind: string, d: Record<string, unknown>): string[] {
  const v = (key: string) => d[key];
  const has = (key: string) => v(key) !== undefined && v(key) !== null && v(key) !== "";
  const num = (key: string) => typeof v(key) === "number" ? (v(key) as number).toLocaleString("en-US") : String(v(key));
  const lines: (string | false)[] = [];
  switch (kind) {
    case "prompt": {
      const text = String(v("text") ?? "");
      lines.push(has("model") && `Model · ${v("model")}`, has("aspectRatio") && `Aspect · ${v("aspectRatio")}`, text && (text.length > 160 ? `${text.slice(0, 157)}…` : text));
      break;
    }
    case "multiview": lines.push(has("imageModel") && `Model · ${v("imageModel")}`, `Views · front, side${v("includeBack") === false ? "" : ", back"}`); break;
    case "mesh": lines.push(has("provider") && `Engine · ${v("provider")}`, has("tripoFaceLimit") && `Face limit · ${num("tripoFaceLimit")}`, has("tripoTextureQuality") && `Texture · ${v("tripoTextureQuality")}`); break;
    case "bake": lines.push(`Engine · ${v("engine") ?? "blender"}`, has("targetTriangles") && `Target · ${num("targetTriangles")} triangles`, has("textureSize") && `Texture · ${v("textureSize")}px`, Number(v("turnDegrees") ?? 0) !== 0 && `Turn · ${v("turnDegrees")}°`, has("triangleCount") && `Result · ${num("triangleCount")} triangles`); break;
    case "rig": {
      const bones = Array.isArray(v("boneNames")) ? (v("boneNames") as string[]) : [];
      const fingers = bones.filter((b) => /Thumb|Index|Middle|Ring|Little|Pinky/.test(b)).length;
      lines.push(`Engine · ${v("engine") ?? "meshy"}`, v("engine") !== "tripo" && has("heightMeters") && `Height · ${v("heightMeters")} m`, bones.length > 0 && `Bones · ${bones.length}${fingers ? ` (${fingers} finger)` : ""}`);
      break;
    }
    case "animate": {
      const tripo = v("rigEngine") === "tripo";
      const presets = tripo ? ((v("tripoPresetIds") as string[] | undefined) ?? []).map((p) => p.replace(/^preset:/, "")) : ((v("presetIds") as number[] | undefined) ?? []).map(String);
      lines.push(`Engine · ${tripo ? "tripo" : "meshy"}`, presets.length > 0 && `Clips · ${presets.join(", ")}`, tripo && v("inPlace") !== false && "In place");
      break;
    }
    case "export": lines.push(has("target") && `Target · ${v("target")}`, has("triangleBudget") && `Budget · ${num("triangleBudget")} triangles`, has("triangleCount") && `Result · ${num("triangleCount")} triangles${v("budgetPass") === true ? " · pass" : ""}`); break;
    case "image": lines.push(has("fileName") && String(v("fileName"))); break;
  }
  return lines.filter((line): line is string => Boolean(line));
}

export function CaptureCanvas({ graph }: { graph: ProjectGraph }) {
  const nodes = useMemo(() => graph.nodes.map((n): Card => {
    const d = n.data;
    const asset = n.type === "viewer" ? getIncomingGlbAssetId(n.id, graph.nodes, graph.edges) : n.type === "mesh" ? n.data.outputAssetId : null;
    const handles = graph.edges.flatMap<{ id: string; type: "source" | "target" }>((e) => e.source === n.id ? [{ id: e.sourceHandle ?? "", type: "source" as const }] : e.target === n.id ? [{ id: e.targetHandle ?? "", type: "target" as const }] : []);
    const text = cardLines(n.type ?? "", d as Record<string, unknown>).join("\n");
    return { id: n.id, type: "capture", position: n.position, data: { kind: n.type!, asset, image: getNodeImageAssetId(n), exposure: "exposure" in d ? d.exposure : 1, text, handles: handles.filter((h, i) => handles.findIndex((other) => other.id === h.id && other.type === h.type) === i) } };
  }), [graph]);
  return <main style={{ width: "100vw", height: "100vh", background: "#f4efdf" }}><style>{`nextjs-portal { display: none !important; } body { margin: 0; }`}</style><ReactFlow defaultNodes={nodes} defaultEdges={graph.edges} nodeTypes={types} fitView minZoom={0.001} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} onlyRenderVisibleElements={false} proOptions={{ hideAttribution: true }}><Ready empty={nodes.length === 0} viewers={nodes.filter((n) => n.data.asset).length} /><Background gap={20} color="#0002" /></ReactFlow></main>;
}
