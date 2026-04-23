"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { fal } from "@fal-ai/client";
import { useSnapshot } from "valtio";

import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";
import { fetchJson } from "@/lib/api/client";
import { VISION_MODEL_OPTIONS } from "@/lib/fal/models";
import { buildVisionRequest, extractVisionAnswer, pickVisionSlug } from "@/lib/fal/vision";
import { getIncomingImageUrls } from "@/lib/graph/selectors";
import { graphHistory, updateVisionNode } from "@/lib/graph/store";
import type { VisionNode as VisionGraphNode } from "@/lib/graph/types";

type FalQueueStatus = {
  status: string;
};

export function VisionNode({ id, data }: NodeProps<VisionGraphNode>) {
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

      const slug = pickVisionSlug();
      const input = buildVisionRequest({
        prompt: data.question,
        imageUrls: sourceImages,
        model: data.model,
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

      updateVisionNode(id, {
        activeJobId: job.jobId,
        runStatus: "IN_QUEUE",
        errorMessage: null,
      });

      let status = (await fal.queue.status(slug, {
        requestId: submission.request_id,
        logs: true,
      })) as FalQueueStatus;

      while (status.status !== "COMPLETED" && status.status !== "FAILED") {
        updateVisionNode(id, {
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
            error: "Vision analysis failed.",
          }),
        });

        throw new Error("Vision analysis failed.");
      }

      const result = await fal.queue.result(slug, {
        requestId: submission.request_id,
      });
      const parsed = extractVisionAnswer(result as Record<string, unknown>);

      await fetchJson(`/api/jobs/${job.jobId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          state: "succeeded",
          responseSummary: result.data,
        }),
      });

      return parsed;
    },
    onSuccess: ({ answer, cost }) => {
      updateVisionNode(id, {
        activeJobId: null,
        answer,
        lastRunCost: cost,
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
      });
    },
    onError: (error) => {
      updateVisionNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Vision run failed.",
      });
    },
  });

  return (
    <NodeChrome title="Vision" accentClassName="bg-[#ff8a3d]" testId="vision-node" nodeId={id}>
      <Handle
        data-testid="vision-image-in"
        type="target"
        id="image-in"
        position={Position.Left}
        className="!h-4 !w-4 !border-[3px] !border-black !bg-white"
      />
      <textarea
        data-testid="vision-question"
        value={data.question}
        onChange={(event) =>
          updateVisionNode(id, {
            question: event.target.value,
            inputsChangedSinceLastRun: true,
          })
        }
        className="nodrag min-h-24 w-full resize-none border-[3px] border-black bg-white p-2 font-mono text-sm outline-none"
        placeholder="Ask about the connected image..."
      />
      <label className="block text-xs font-black uppercase">Model</label>
      <select
        data-testid="vision-model"
        value={data.model}
        onChange={(event) =>
          updateVisionNode(id, {
            model: event.target.value as VisionGraphNode["data"]["model"],
            inputsChangedSinceLastRun: true,
          })
        }
        className="nodrag w-full border-[3px] border-black bg-white p-2 text-sm font-bold"
      >
        {VISION_MODEL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} · {option.tagline}
          </option>
        ))}
      </select>
      <div className="relative min-h-36 overflow-hidden border-[3px] border-black bg-[#fff8dc] p-3">
        {data.answer ? (
          <p data-testid="vision-answer" className="whitespace-pre-wrap font-mono text-sm leading-5">
            {data.answer}
          </p>
        ) : (
          <div className="flex min-h-30 items-center justify-center text-center font-mono text-xs uppercase">
            Vision answer appears here
          </div>
        )}
        {runMutation.isPending ? (
          <div className="absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,#00000055_0_8px,transparent_8px_16px)] p-2 font-mono text-xs uppercase">
            {data.runStatus ?? "Running"}
          </div>
        ) : null}
      </div>
      <button
        data-testid="vision-run-button"
        type="button"
        disabled={runMutation.isPending || data.question.trim().length === 0}
        onClick={() => runMutation.mutate()}
        className="w-full border-[3px] border-black bg-white px-3 py-2 text-left font-black uppercase shadow-[4px_4px_0_#000] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:bg-[#e7e2cf] disabled:shadow-none"
      >
        {runMutation.isPending
          ? "… Running"
          : `Run ${data.inputsChangedSinceLastRun ? "•" : ""}${data.lastRunCost ? ` ~$${data.lastRunCost.toFixed(4)}` : ""}`}
      </button>
      {data.errorMessage ? <p className="font-mono text-xs text-[#d61f1f]">{data.errorMessage}</p> : null}
    </NodeChrome>
  );
}
