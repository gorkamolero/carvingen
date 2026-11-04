"use client";
/* eslint-disable @next/next/no-img-element */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSnapshot, snapshot } from "valtio";
import { NodeChrome } from "./NodeChrome";
import { graphHistory, updatePipelineNode, markNodeDirty } from "@/lib/graph/store";
import type { PipelineNode, CarvingNode, CarvingEdge } from "@/lib/graph/types";
import type { PipelineData } from "@/lib/character/schema";
import { characterInputs, submitCharacterJob, pollCharacterJob, resultPatch } from "@/lib/character/client";
import { ANIMATION_PRESETS } from "@/lib/character/fal";
import { estimateNodeCost } from "@/lib/fal/pricing";
import { getAssetUrl } from "@/lib/assets/url";
import { fetchJson } from "@/lib/api/client";

const titles = { multiview: "Multi-view", bake: "Bake", rig: "Rig", animate: "Animate", animation: "Animation", export: "Engine export" };
export function CharacterNode({ id, type, data }: NodeProps<PipelineNode>) {
  const graph = useSnapshot(graphHistory.value);
  const [submitting, setSubmitting] = useState(false);
  const patch = (value: Partial<PipelineData>) => updatePipelineNode(id, value);
  const query = useQuery({ queryKey: ["character-job", data.activeJobId], queryFn: () => pollCharacterJob(data.activeJobId!), enabled: !!data.activeJobId, refetchInterval: 2000 });
  useEffect(() => {
    const status = query.data;
    if (!data.activeJobId || !status) return;
    if (status.state === "succeeded" && status.result) { updatePipelineNode(id, resultPatch(status.result, data)); markNodeDirty(id); }
    else if (status.state === "failed") updatePipelineNode(id, { activeJobId: null, errorMessage: status.error ?? "Job failed", runStatus: "FAILED" });
  }, [query.data, data, id]);
  const input = characterInputs({ id, type, data, position: { x: 0, y: 0 } } as PipelineNode, graph.nodes as unknown as CarvingNode[], graph.edges as unknown as CarvingEdge[]);
  async function run() {
    setSubmitting(true);
    try {
      // Read the live graph at click time: a render-time snapshot can predate an upstream rerun.
      const live = snapshot(graphHistory.value);
      if (!live.activeProjectId) throw new Error("No active project");
      const liveInput = characterInputs({ id, type, data, position: { x: 0, y: 0 } } as PipelineNode, live.nodes as unknown as CarvingNode[], live.edges as unknown as CarvingEdge[]);
      const job = await submitCharacterJob(type, { projectId: live.activeProjectId, nodeId: id, data, ...liveInput });
      patch({ activeJobId: job.jobId, errorMessage: null, runStatus: "Queued" });
    } catch (e) { patch({ errorMessage: e instanceof Error ? e.message : "Run failed" }); }
    finally { setSubmitting(false); }
  }
  const field = (key: keyof PipelineData, label: string, options?: readonly (string | number)[]) => <label className="block text-xs font-bold" key={key}>{label}
    {options ? <select className="nodrag block w-full border-2 border-black p-1" value={String(data[key] ?? options[0])} onChange={(e) => patch({ [key]: typeof data[key] === "number" || typeof options[0] === "number" ? Number(e.target.value) : e.target.value })}>{options.map((v) => <option key={v}>{v}</option>)}</select>
      : typeof data[key] === "boolean" ? <input className="nodrag ml-2" type="checkbox" checked={Boolean(data[key])} onChange={(e) => patch({ [key]: e.target.checked })} />
        : <input className="nodrag block w-full border-2 border-black p-1" type={typeof data[key] === "number" ? "number" : "text"} value={String(data[key] ?? "")} onChange={(e) => patch({ [key]: typeof data[key] === "number" ? Number(e.target.value) : e.target.value })} />}
  </label>;
  const busy = submitting || !!data.activeJobId;
  return <NodeChrome title={titles[type]} nodeId={id} testId={`${type}-node`} accentClassName="bg-[#ffd400]" collapsed={data.collapsed} onToggleCollapsed={() => patch({ collapsed: !data.collapsed })}>
    {type !== "animation" && <Handle type="target" id={type === "multiview" ? "image-in" : "glb-in"} position={Position.Left} />}
    {type === "animate" && <Handle type="target" id="animation-in" position={Position.Left} style={{ top: "75%" }} />}
    <Handle type="source" id={type === "multiview" ? "image-out" : type === "animation" ? "animation-out" : "glb-out"} position={Position.Right} />
    {!data.collapsed && <>
      {type === "animation" ? <label className="text-xs">Upload FBX / BVH / GLB<input className="nodrag w-full" type="file" accept=".fbx,.bvh,.glb" onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const body = new FormData(); body.append("file", file);
        try { const saved = await fetchJson<{ assetId: string }>("/api/assets/upload", { method: "POST", body }); patch({ assetId: saved.assetId, fileName: file.name, errorMessage: null }); markNodeDirty(id); }
        catch (error) { patch({ errorMessage: error instanceof Error ? error.message : "Upload failed" }); }
      }} />{data.fileName}</label> : null}
      {type === "multiview" && <><label className="text-xs">Image model<select className="nodrag block w-full" value={data.imageModel} onChange={(e) => patch({ imageModel: e.target.value as typeof data.imageModel, inputsChangedSinceLastRun: true })}><option value="fal-ai/nano-banana-2">Nano Banana 2</option><option value="codex/gpt-image">GPT Image · Codex subscription</option></select></label>{field("includeBack", "Include back view")}{field("equipment", "Equipment cutouts (comma separated)")}</>}
      {type === "bake" && <>{field("engine", "Engine", ["blender", "tripo"])}{field("targetTriangles", data.engine === "tripo" ? "Target faces (500–20000; quads ≤10000)" : "Target triangles")}{data.engine === "blender" ? <>{field("keepUvs", "Keep UVs")}{field("textureSize", "Texture size", [1024, 2048, 4096])}{field("turnDegrees", "Turn (degrees, so the model faces front)", [0, 90, 180, 270])}</> : field("quad", "Quad topology")}</>}
      {(type === "rig" || type === "animate") && field("heightMeters", "Character height (metres)")}
      {type === "animate" && <div className="space-y-1 text-xs"><p>Preset slots · fal rigs the input again</p>{data.presetIds.map((preset, i) => <div className="flex gap-1" key={i}><select aria-label={`Preset ${i + 1}`} className="nodrag w-full border-2 border-black" value={preset} onChange={(e) => patch({ presetIds: data.presetIds.map((v, index) => index === i ? Number(e.target.value) : v) })}>{ANIMATION_PRESETS.map((p) => <option value={p.id} key={p.id}>{p.name} ({p.id})</option>)}{!ANIMATION_PRESETS.some((p) => p.id === preset) && <option value={preset}>Library ID {preset}</option>}</select><button className="nodrag" onClick={() => patch({ presetIds: data.presetIds.filter((_, index) => index !== i) })}>×</button></div>)}<button className="nodrag border-2 border-black p-1" disabled={data.presetIds.length >= 10} onClick={() => patch({ presetIds: [...data.presetIds, 0] })}>+ Preset</button><label className="block">Other library ID (0–696)<input className="nodrag border-2 border-black w-full" type="number" min={0} max={696} onKeyDown={(e) => { if (e.key === "Enter" && data.presetIds.length < 10) { const n = Number(e.currentTarget.value); if (Number.isInteger(n) && n >= 0 && n <= 696) patch({ presetIds: [...data.presetIds, n] }); } }} /></label><p>Connect Animation for a custom clip. Remove all presets for local-only retargeting.</p></div>}
      {type === "export" && <>{field("characterName", "Character name")}{field("target", "Target", ["unity", "unreal"])}{field("triangleBudget", "Triangle budget")}</>}
    </>}
    {type === "multiview" && (data.activeAssetId ?? data.artifactAssetIds.front) && <img className="w-full max-h-64 object-contain border-2 border-black" src={getAssetUrl(data.activeAssetId ?? data.artifactAssetIds.front)} alt="Selected character view" />}
    {data.triangleCount !== null && <p className="text-xs">{data.triangleCount.toLocaleString()} triangles {data.budgetPass !== null ? data.budgetPass ? "· Budget PASS" : "· Budget FAIL" : ""}</p>}
    {data.boneNames.length > 0 && <details className="nodrag text-xs"><summary>{data.boneNames.length} bones</summary>{data.boneNames.join(", ")}</details>}
    {type === "multiview" && Object.keys(data.artifactAssetIds).length > 0 && <label className="text-xs">Image output<select className="nodrag block w-full" value={data.activeAssetId ?? data.artifactAssetIds.front} onChange={(e) => { patch({ activeAssetId: e.target.value }); markNodeDirty(id); }}>{Object.entries(data.artifactAssetIds).map(([name, value]) => <option key={name} value={value}>{name}</option>)}</select></label>}
    {type !== "animation" && <button className="nodrag border-[3px] border-black bg-[#ffd400] p-2 w-full text-xs font-bold disabled:opacity-50" disabled={busy || (type === "multiview" ? !input.imageAssetIds.length : !input.meshAssetIds.length)} onClick={run}>{busy ? `${query.data?.result?.progress ?? 0}% ${query.data?.result?.status ?? "Running"}` : `Run · ${estimateNodeCost({ type, data }).label}`}</button>}
    <div className="flex flex-wrap gap-1">{Object.entries(data.artifactAssetIds).map(([name, assetId]) => <a className="nodrag border border-black p-1 text-[10px]" key={name} href={getAssetUrl(assetId)} download>{name}</a>)}</div>
    {data.outputAssetIds.length > 0 && <details className="nodrag text-xs"><summary>History · {data.outputAssetIds.length} files</summary>{data.outputAssetIds.map((a, i) => <a key={`${a}-${i}`} href={getAssetUrl(a)} download className="block">Output {i + 1}</a>)}</details>}
    {(data.errorMessage || query.error) && <p role="alert" className="text-xs text-red-700">{data.errorMessage ?? query.error?.message}</p>}
  </NodeChrome>;
}
