"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { fal } from "@fal-ai/client";
import { useSnapshot } from "valtio";

import { getAssetUrl } from "@/lib/assets/url";
import { fetchJson } from "@/lib/api/client";
import { buildImageRequest, pickImageSlug } from "@/lib/fal/image";
import { IMAGE_MODEL_CAPABILITIES, type ImageModelBase, type ImageResolution } from "@/lib/fal/models";
import { graphHistory, markNodeDirty, updatePromptNode } from "@/lib/graph/store";
import { getIncomingImageUrls } from "@/lib/graph/selectors";
import type { PromptNode as PromptGraphNode } from "@/lib/graph/types";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

type FalQueueStatus = {
  status: string;
};

const ASPECT_RATIO_CLASS_BY_VALUE = {
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "4:3": "aspect-[4/3]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
  "3:2": "aspect-[3/2]",
  "2:3": "aspect-[2/3]",
} as const;

export function PromptNode({ id, data }: NodeProps<PromptGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const references = getIncomingImageUrls(
    id,
    graph.nodes as unknown as PromptGraphNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );
  const latestAssetId = data.outputAssetIds.at(-1) ?? null;
  const history = data.outputAssetIds.slice(0, -1).reverse();
  const capability = IMAGE_MODEL_CAPABILITIES[data.model];
  const aspectRatioClass = ASPECT_RATIO_CLASS_BY_VALUE[data.aspectRatio];

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) {
        throw new Error("No active project.");
      }

      const slug = pickImageSlug(data.model, references);
      const input = buildImageRequest({
        modelBase: data.model,
        prompt: data.text,
        referenceImages: references,
        aspectRatio: data.aspectRatio,
        resolution: data.resolution,
        seed: data.seed,
      });

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

      updatePromptNode(id, {
        activeJobId: job.jobId,
        runStatus: "IN_QUEUE",
        errorMessage: null,
      });

      let status = (await fal.queue.status(slug, {
        requestId: submission.request_id,
        logs: true,
      })) as FalQueueStatus;

      while (status.status !== "COMPLETED" && status.status !== "FAILED") {
        updatePromptNode(id, {
          runStatus: status.status,
        });

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
            error: "fal generation failed",
          }),
        });

        throw new Error("fal generation failed");
      }

      const result = await fal.queue.result(slug, {
        requestId: submission.request_id,
      });

      const imageUrl = result.data.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image returned by fal.");
      }

      const persisted = await fetchJson<{ assetId: string; url: string; bytes: number }>(
        "/api/assets/persist",
        {
          method: "POST",
          body: JSON.stringify({
            sourceUrl: imageUrl,
            kind: "image",
            jobId: job.jobId,
          }),
        },
      );

      await fetchJson(`/api/jobs/${job.jobId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          state: "succeeded",
          responseSummary: result.data,
          outputAssetIds: [persisted.assetId],
        }),
      });

      return persisted.assetId;
    },
    onSuccess: (assetId) => {
      updatePromptNode(id, {
        activeJobId: null,
        outputAssetIds: [...data.outputAssetIds, assetId],
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
      });
      markNodeDirty(id);
    },
    onError: (error) => {
      updatePromptNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Prompt run failed.",
      });
    },
  });

  const estimate = capability.estimateByResolution[data.resolution] ?? capability.estimateByResolution["1K"];

  return (
    <NodeChrome title="Prompt" accentClassName="bg-[#ffd400]" className="nodrag" testId="prompt-node" nodeId={id}>
      <Handle data-testid="prompt-image-in" type="target" id="image-in" position={Position.Left} className="!h-4 !w-4 !border-[3px] !border-black !bg-white" />
      <textarea
        data-testid="prompt-textarea"
        value={data.text}
        onChange={(event) => {
          updatePromptNode(id, { text: event.target.value, inputsChangedSinceLastRun: true });
          markNodeDirty(id);
        }}
        className="nodrag min-h-28 w-full resize-none border-[3px] border-black bg-white p-2 font-mono text-sm outline-none"
        placeholder="Describe the carving concept..."
      />
      <div className="space-y-2">
        <label className="block text-xs font-black uppercase">Model</label>
        <select
          data-testid="prompt-model"
          value={data.model}
          onChange={(event) => {
            const model = event.target.value as ImageModelBase;
            const nextResolution = IMAGE_MODEL_CAPABILITIES[model].resolutions.includes(data.resolution)
              ? data.resolution
              : "1K";
            updatePromptNode(id, {
              model,
              resolution: nextResolution as ImageResolution,
              inputsChangedSinceLastRun: true,
            });
            markNodeDirty(id);
          }}
          className="nodrag w-full border-[3px] border-black bg-white p-2 text-sm font-bold"
        >
          {Object.entries(IMAGE_MODEL_CAPABILITIES).map(([model, meta]) => (
            <option key={model} value={model}>
              {meta.displayName} · {meta.tagline}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {capability.aspectRatios.map((ratio: (typeof capability.aspectRatios)[number]) => (
          <button
            key={ratio}
            type="button"
            onClick={() => {
              updatePromptNode(id, {
                aspectRatio: ratio,
                inputsChangedSinceLastRun: true,
              });
              markNodeDirty(id);
            }}
            className={`border-[3px] border-black px-2 py-1 text-xs font-black ${ratio === data.aspectRatio ? "bg-black text-white" : "bg-white"}`}
          >
            {ratio}
          </button>
        ))}
      </div>
      {capability.resolutions.length > 1 ? (
        <div className="flex gap-2">
          {capability.resolutions.map((resolution: (typeof capability.resolutions)[number]) => (
            <button
              key={resolution}
              type="button"
              onClick={() => {
                updatePromptNode(id, {
                  resolution,
                  inputsChangedSinceLastRun: true,
                });
                markNodeDirty(id);
              }}
              className={`border-[3px] border-black px-2 py-1 text-xs font-black ${resolution === data.resolution ? "bg-black text-white" : "bg-white"}`}
            >
              {resolution}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`relative overflow-hidden border-[3px] border-black bg-[#fff8dc] ${aspectRatioClass}`}>
        {latestAssetId ? (
          <img src={getAssetUrl(latestAssetId)} alt="Latest output" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-44 items-center justify-center bg-[radial-gradient(circle_at_1px_1px,#000_1px,transparent_0)] [background-size:16px_16px] text-center font-mono text-xs uppercase">
            Latest output appears here
          </div>
        )}
        {runMutation.isPending ? (
          <div className="absolute inset-0 flex flex-col justify-end bg-[repeating-linear-gradient(45deg,#00000055_0_8px,transparent_8px_16px)] p-2 font-mono text-xs uppercase">
            {data.runStatus ?? "Running"}
          </div>
        ) : null}
      </div>
      <div data-testid="history-strip" className="flex gap-2 overflow-x-auto">
        {history.map((assetId: string) => (
          <img
            key={assetId}
            src={getAssetUrl(assetId)}
            alt="Previous run"
            className="h-12 w-12 shrink-0 border-[3px] border-black object-cover"
          />
        ))}
      </div>
      <div className="space-y-2">
        <button
          data-testid="run-button"
          type="button"
          disabled={runMutation.isPending || data.text.trim().length === 0}
          onClick={() => runMutation.mutate()}
          className="w-full border-[3px] border-black bg-white px-3 py-2 text-left font-black uppercase shadow-[4px_4px_0_#000] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:bg-[#e7e2cf] disabled:shadow-none"
        >
          {runMutation.isPending ? "… Running" : `Run ${data.inputsChangedSinceLastRun ? "•" : ""} ~$${estimate?.toFixed(2) ?? "0.00"}`}
        </button>
        {data.errorMessage ? <p className="font-mono text-xs text-[#d61f1f]">{data.errorMessage}</p> : null}
      </div>
      <Handle data-testid="prompt-image-out" type="source" id="image-out" position={Position.Right} className="!h-4 !w-4 !border-[3px] !border-black !bg-white" />
    </NodeChrome>
  );
}
