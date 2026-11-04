"use client";
/* eslint-disable @next/next/no-img-element */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { snapshot, useSnapshot } from "valtio";
import { NodeChrome } from "./NodeChrome";
import { graphHistory, updatePipelineNode, markNodeDirty } from "@/lib/graph/store";
import type { MotionGraphNode, CarvingNode, CarvingEdge } from "@/lib/graph/types";
import type { PipelineData } from "@/lib/character/schema";
import { characterInputs, pollCharacterJob, submitCharacterJob, resultPatch } from "@/lib/character/client";
import { estimateNodeCost } from "@/lib/fal/pricing";
import { getAssetUrl } from "@/lib/assets/url";
export function MotionNode({ id, data }: NodeProps<MotionGraphNode>) {
  const graph = useSnapshot(graphHistory.value), [submitting, setSubmitting] = useState(false);
  const patch = (p: Partial<PipelineData>) => updatePipelineNode(id, p);
  const query = useQuery({ queryKey: ["character-job", data.activeJobId], queryFn: () => pollCharacterJob(data.activeJobId!), enabled: !!data.activeJobId, refetchInterval: 2000 });
  useEffect(() => {
    const job = query.data; if (!data.activeJobId || !job) return;
    if (job.state === "succeeded" && job.result) { updatePipelineNode(id, resultPatch(job.result, data)); markNodeDirty(id); }
    else if (job.state === "failed") updatePipelineNode(id, { activeJobId: null, runStatus: "FAILED", errorMessage: job.error ?? "Job failed", motionReport: job.result?.motion ?? data.motionReport, lastRunCost: job.result?.lastRunCost ?? data.lastRunCost, artifactAssetIds: { ...data.artifactAssetIds, ...Object.fromEntries((job.result?.assets ?? []).map((a) => [a.name, a.assetId])) } });
  }, [query.data, data, id]);
  const node = { id, type: "motion" as const, data, position: { x: 0, y: 0 } };
  const input = characterInputs(node, graph.nodes as unknown as CarvingNode[], graph.edges as unknown as CarvingEdge[]);
  const report = query.data?.result?.motion ?? data.motionReport;
  async function run() {
    setSubmitting(true);
    try {
      const live = snapshot(graphHistory.value); if (!live.activeProjectId) throw new Error("No active project");
      const current = live.nodes.find((n) => n.id === id) as unknown as MotionGraphNode;
      const job = await submitCharacterJob("motion", { projectId: live.activeProjectId, nodeId: id, data: current.data, ...characterInputs(current, live.nodes as unknown as CarvingNode[], live.edges as unknown as CarvingEdge[]) });
      patch({ activeJobId: job.jobId, motionReport: null, errorMessage: null, runStatus: "Queued" });
    } catch (e) { patch({ errorMessage: e instanceof Error ? e.message : "Run failed" }); }
    finally { setSubmitting(false); }
  }
  const field = (key: keyof PipelineData, label: string, options?: string[], min?: number, max?: number, step?: number) => <label className="block text-xs font-bold" key={key}>{label}{options ? <select className="nodrag block w-full border-2 border-black p-1" value={String(data[key])} onChange={(e) => patch({ [key]: e.target.value })}>{options.map((o) => <option key={o}>{o}</option>)}</select> : <input className="nodrag block w-full border-2 border-black p-1" type={min !== undefined || key === "seedBase" ? "number" : "text"} min={min} max={max} step={step} maxLength={key === "moveName" ? 40 : key === "subjectDescription" ? 300 : undefined} value={String(data[key] ?? "")} onChange={(e) => patch({ [key]: key === "seedBase" ? e.target.value === "" ? null : Number(e.target.value) : min !== undefined ? Number(e.target.value) : e.target.value })} />}</label>;
  const image = (asset: string | undefined, alt: string) => asset ? <a className="nodrag" href={getAssetUrl(asset)} target="_blank" rel="noreferrer"><img className="w-full border border-black" src={getAssetUrl(asset)} alt={alt} /></a> : null;
  const number = (n: number | null | undefined, places = 2) => n == null ? "not scored" : n.toFixed(places);
  const busy = submitting || !!data.activeJobId;
  const artifacts = { ...data.artifactAssetIds, ...Object.fromEntries((query.data?.result?.assets ?? []).map((a) => [a.name, a.assetId])), ...Object.fromEntries((report?.takes ?? []).flatMap((t) => Object.entries(t.assets).map(([k, v]) => [`take-${t.index}-${k}`, v]))) };
  return <NodeChrome title="Motion" nodeId={id} testId="motion-node" accentClassName="bg-[#ffd400]" collapsed={data.collapsed} onToggleCollapsed={() => patch({ collapsed: !data.collapsed })}>
    <Handle type="target" id="glb-in" position={Position.Left} /><Handle type="source" id="glb-out" position={Position.Right} />
    {!data.collapsed && <>
      {field("moveName", "Move name")}{field("firstPose", "First pose", ["standing", "low", "high", "prone"])}
      <label className="block text-xs font-bold">Action sentence<textarea className="nodrag block w-full border-2 border-black p-1" maxLength={600} value={data.actionSentence} onChange={(e) => patch({ actionSentence: e.target.value })} /></label>
      {field("planted", "Planted", ["feet", "hands", "body"])}{field("subjectDescription", "Subject description")}{field("clipSeconds", "Clip seconds", undefined, 3, 4, .1)}{field("takeBudget", "Take budget", undefined, 1, 12, 1)}{field("seedBase", "Seed base (empty = random)")}{field("heightMeters", "Character height (metres)", undefined, .01, 100, .1)}
      <button className="nodrag w-full border-[3px] border-black bg-[#ffd400] p-2 text-xs font-bold disabled:opacity-50" disabled={busy || !input.meshAssetIds.length || !data.actionSentence.trim()} onClick={run}>{busy ? `${query.data?.result?.progress ?? 0}% ${query.data?.result?.status ?? "Queued"}` : `Run · ${estimateNodeCost(node).label}`}</button>
      {report && <div className="space-y-2 text-xs">
        {image(report.reference.assetId, "Two-view reference frame")}
        <details className="nodrag"><summary>Prompt</summary><p className="whitespace-pre-wrap">{report.prompt}</p></details>
        <div>{report.steps.map((s) => <p key={s.name}>{s.name} · {s.state}{s.detail ? ` · ${s.detail}` : ""}</p>)}</div>
        {report.takes.map((t) => <div key={t.index} className="border-2 border-black p-2 space-y-1">
          <b>Take {t.index} · seed {t.seed} · ${t.usd.toFixed(2)} · {t.status.toUpperCase()}{report.chosenTake === t.index ? " · CHOSEN" : ""}</b>
          {image(t.assets["video-sheet"], `Take ${t.index} video joints`)}
          {t.gates && <p>coverage {Math.round(t.gates.coverage * 100)}% · facing {Math.round(t.gates.facing * 100)}% · agreement {number(t.gates.agreement.score)} ({Object.entries(t.gates.agreement).filter(([k]) => k !== "score").map(([k, v]) => `${k.replace("_", " ")} ${number(v)}`).join(", ")}) · studio {number(t.gates.studio.floorMaxDeviationPx, 0)}/{number(t.gates.studio.dividerMaxDeviationPx, 0)} px</p>}
          {t.fit && <p>reprojection front-x {number(t.fit.reproj_confident_px.front_x_only, 1)} px · side {number(t.fit.reproj_confident_px.side, 1)} px</p>}
          {t.checks && <p>min skin z {t.checks.minSkinZ >= 0 ? "+" : ""}{number(t.checks.minSkinZ, 3)} m · hand/torso overlaps {t.checks.handTorsoOverlapMax} · planted drift {number(t.checks.plantedDriftCm, 1)} cm</p>}
          {image(t.assets.sheet, `Take ${t.index} Blender contact sheet`)}
          {t.reasons.map((r, i) => <p className="text-red-700" key={i}>{r}</p>)}
        </div>)}
        <p>Total · ${report.totalUsd.toFixed(2)}</p>
      </div>}
      <div className="flex flex-wrap gap-1">{Object.entries(artifacts).map(([name, asset]) => <a className="nodrag border border-black p-1 text-[10px]" key={name} href={getAssetUrl(asset)} download>{name}</a>)}</div>
    </>}
    {(data.errorMessage || query.error) && <p role="alert" className="text-xs text-red-700">{data.errorMessage ?? query.error?.message}</p>}
  </NodeChrome>;
}
