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
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";

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
    onMutate: () => {
      return showLoadingToast({
        title: "Vision running",
        description: `Reading ${sourceImages.length} image${sourceImages.length === 1 ? "" : "s"}.`,
      });
    },
    onSuccess: ({ answer, cost }, _variables, toastId) => {
      updateVisionNode(id, {
        activeJobId: null,
        answer,
        lastRunCost: cost,
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
      });
      showSuccessToast(toastId, {
        title: "Vision complete",
        description: "Answer updated.",
      });
    },
    onError: (error, _variables, toastId) => {
      updateVisionNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: getErrorMessage(error, "Vision run failed."),
      });
      showErrorToast(toastId, {
        title: "Vision failed",
        description: getErrorMessage(error, "Vision run failed."),
      });
    },
  });

  const runDisabled = runMutation.isPending || data.question.trim().length === 0;
  const changedDot = data.inputsChangedSinceLastRun && !runMutation.isPending;

  if (data.collapsed) {
    return (
      <NodeChrome
        title="Vision"
        accentClassName="bg-[#ff8a3d]"
        testId="vision-node"
        nodeId={id}
        collapsed
        onToggleCollapsed={() => updateVisionNode(id, { collapsed: false })}
      >
        <Handle
          data-testid="vision-image-in"
          type="target"
          id="image-in"
          position={Position.Left}
        />
        <div className="aspect-square w-full overflow-hidden border-[3px] border-black bg-[#f9f5e8] p-2">
          {data.answer ? (
            <p className="overflow-hidden font-mono text-[10px] leading-[1.4] text-black/85 line-clamp-[12]">
              {data.answer}
            </p>
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
              no answer
            </div>
          )}
        </div>
      </NodeChrome>
    );
  }

  return (
    <NodeChrome
      title="Vision"
      accentClassName="bg-[#ff8a3d]"
      testId="vision-node"
      nodeId={id}
      collapsed={false}
      onToggleCollapsed={() => updateVisionNode(id, { collapsed: true })}
    >
      <Handle
        data-testid="vision-image-in"
        type="target"
        id="image-in"
        position={Position.Left}
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
        className="nodrag block min-h-[88px] w-full resize-none border-[3px] border-black bg-white p-2.5 font-mono text-[13px] leading-[1.45] outline-none placeholder:text-black/35"
        placeholder="Ask about the connected image…"
      />
      <div className="space-y-1.5">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">Model</div>
        <select
          data-testid="vision-model"
          value={data.model}
          onChange={(event) =>
            updateVisionNode(id, {
              model: event.target.value as VisionGraphNode["data"]["model"],
              inputsChangedSinceLastRun: true,
            })
          }
          className="nodrag h-9 w-full border-[3px] border-black bg-white px-2.5 text-[13px] font-semibold leading-none"
        >
          {VISION_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} · {option.tagline}
            </option>
          ))}
        </select>
      </div>
      <div className="relative min-h-[128px] overflow-hidden border-[3px] border-black bg-[#f9f5e8] p-3">
        {data.answer ? (
          <p data-testid="vision-answer" className="whitespace-pre-wrap font-mono text-[12px] leading-[1.5]">
            {data.answer}
          </p>
        ) : (
          <div className="flex min-h-[104px] items-center justify-center text-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
            Answer appears here
          </div>
        )}
        {runMutation.isPending ? (
          <div className="pointer-events-none absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
            <span className="inline-block self-start border-[2px] border-black bg-[#ff8a3d] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
              {data.runStatus ?? "Running"}
            </span>
          </div>
        ) : null}
      </div>
      <button
        data-testid="vision-run-button"
        type="button"
        disabled={runDisabled}
        onClick={() => runMutation.mutate()}
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#ff8a3d] px-3 text-[12px] font-black uppercase tracking-[0.16em] shadow-[4px_4px_0_0_#0a0a0a] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#0a0a0a] disabled:cursor-not-allowed disabled:bg-[#e5d6c6] disabled:text-black/40 disabled:shadow-none"
      >
        <span className="flex items-center gap-2">
          {runMutation.isPending ? "Running…" : "Run"}
          {changedDot ? <span className="inline-block h-2 w-2 bg-[#d8421b]" aria-hidden /> : null}
        </span>
        {data.lastRunCost ? (
          <span className="font-mono text-[10px] font-medium text-black/70">
            ~${data.lastRunCost.toFixed(4)}
          </span>
        ) : null}
      </button>
      {data.errorMessage ? (
        <p className="font-mono text-[11px] text-[#d8421b]">{data.errorMessage}</p>
      ) : null}
    </NodeChrome>
  );
}
