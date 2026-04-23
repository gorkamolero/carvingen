"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { fal } from "@fal-ai/client";
import { useSnapshot } from "valtio";

import { fetchJson } from "@/lib/api/client";
import { getAssetUrl } from "@/lib/assets/url";
import { buildMeshRequest, extractMeshArtifacts, pickMeshSlug } from "@/lib/fal/mesh";
import { graphHistory, markNodeDirty, updateMeshNode } from "@/lib/graph/store";
import { getIncomingImageUrls } from "@/lib/graph/selectors";
import type { MeshNode as MeshGraphNode } from "@/lib/graph/types";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

type FalQueueStatus = {
  status: string;
};

export function MeshNode({ id, data }: NodeProps<MeshGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const sourceImages = getIncomingImageUrls(
    id,
    graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) {
        throw new Error("No active project.");
      }

      const imageUrl = sourceImages[0];
      if (!imageUrl) {
        throw new Error("Connect an image before running Mesh.");
      }

      const slug = pickMeshSlug(data.mode);
      const input = buildMeshRequest({ imageUrl, mode: data.mode });
      const submission = await fal.queue.submit(slug, { input });
      const job = await fetchJson<{ jobId: string }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectId: graph.activeProjectId,
          nodeId: id,
          provider: "fal",
          providerJobId: submission.request_id,
          providerSlug: slug,
          requestInput: input,
        }),
      });

      updateMeshNode(id, {
        activeJobId: job.jobId,
        runStatus: "PENDING",
        errorMessage: null,
      });

      let status = (await fal.queue.status(slug, {
        requestId: submission.request_id,
        logs: true,
      })) as FalQueueStatus;

      while (status.status !== "COMPLETED" && status.status !== "FAILED") {
        updateMeshNode(id, { runStatus: status.status });
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        status = (await fal.queue.status(slug, {
          requestId: submission.request_id,
          logs: true,
        })) as FalQueueStatus;
      }

      if (status.status === "FAILED") {
        await fetchJson(`/api/jobs/${job.jobId}/complete`, {
          method: "POST",
          body: JSON.stringify({
            state: "failed",
            error: "Mesh generation failed.",
          }),
        });
        throw new Error("Mesh generation failed.");
      }

      const result = await fal.queue.result(slug, {
        requestId: submission.request_id,
      });

      const artifacts = extractMeshArtifacts(result);
      const persisted = await Promise.all(
        artifacts.map(async (artifact) => {
          const saved = await fetchJson<{ assetId: string; url: string }>(
            "/api/assets/persist",
            {
              method: "POST",
              body: JSON.stringify({
                sourceUrl: artifact.sourceUrl,
                kind: artifact.kind,
                jobId: job.jobId,
              }),
            },
          );

          return { kind: artifact.kind, assetId: saved.assetId };
        }),
      );

      await fetchJson(`/api/jobs/${job.jobId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          state: "succeeded",
          responseSummary: result.data,
          outputAssetIds: persisted.map((item) => item.assetId),
        }),
      });

      return persisted;
    },
    onSuccess: (assets) => {
      const artifactAssetIds = Object.fromEntries(assets.map((asset) => [asset.kind, asset.assetId]));
      updateMeshNode(id, {
        activeJobId: null,
        outputAssetId: artifactAssetIds.glb ?? null,
        thumbnailAssetId: artifactAssetIds.thumbnail ?? null,
        artifactAssetIds,
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
      });
      markNodeDirty(id);
    },
    onError: (error) => {
      updateMeshNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Mesh run failed.",
      });
    },
  });

  return (
    <NodeChrome title="Mesh" accentClassName="bg-[#3e8cff]" testId="mesh-node" nodeId={id}>
      <Handle data-testid="mesh-image-in" type="target" id="image-in" position={Position.Left} className="!h-4 !w-4 !border-[3px] !border-black !bg-white" />
      <div className="flex gap-2">
        {(["preview", "refine"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => updateMeshNode(id, { mode, inputsChangedSinceLastRun: true })}
            className={`border-[3px] border-black px-2 py-1 text-xs font-black uppercase ${mode === data.mode ? "bg-black text-white" : "bg-white"}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="relative min-h-44 overflow-hidden border-[3px] border-black bg-[#f3f0e0]">
        {data.thumbnailAssetId ? (
          <img src={getAssetUrl(data.thumbnailAssetId)} alt="Mesh thumbnail" className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-44 items-center justify-center font-mono text-xs uppercase">
            Mesh thumbnail appears here
          </div>
        )}
        {runMutation.isPending ? (
          <div className="absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,#00000055_0_8px,transparent_8px_16px)] p-2 font-mono text-xs uppercase">
            {data.runStatus ?? "Running"}
          </div>
        ) : null}
      </div>
      <button
        data-testid="mesh-run-button"
        type="button"
        onClick={() => runMutation.mutate()}
        disabled={runMutation.isPending}
        className="w-full border-[3px] border-black bg-white px-3 py-2 text-left font-black uppercase shadow-[4px_4px_0_#000] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:bg-[#e7e2cf] disabled:shadow-none"
      >
        {runMutation.isPending ? "… Running" : "Run"}
      </button>
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.artifactAssetIds).map(([kind, assetId]) => (
          <a
            key={kind}
            href={getAssetUrl(assetId)}
            className="border-[3px] border-black bg-white px-2 py-1 text-xs font-black uppercase"
            download
          >
            {kind}
          </a>
        ))}
      </div>
      {data.errorMessage ? <p className="font-mono text-xs text-[#d61f1f]">{data.errorMessage}</p> : null}
      <Handle data-testid="mesh-glb-out" type="source" id="glb-out" position={Position.Right} className="!h-4 !w-4 !border-[3px] !border-black !bg-white" />
    </NodeChrome>
  );
}
