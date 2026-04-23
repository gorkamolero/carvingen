"use client";

import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  type NodeTypes,
  type OnConnectEnd,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useRef } from "react";
import { useSnapshot } from "valtio";

import { nodeTypes } from "@/features/canvas/flow/nodeTypes";
import {
  addCanvasNode,
  addConnectedPromptFromSource,
  commitGraphInteraction,
  connectNodes,
  graphHistory,
  onEdgesChange,
  onNodesChange,
  updateImageNode,
  updateViewport,
} from "@/lib/graph/store";
import type { CarvingEdge, CarvingNode } from "@/lib/graph/types";

export function CanvasFlow() {
  const graph = useSnapshot(graphHistory.value);
  const flowRef = useRef<ReactFlowInstance<CarvingNode, CarvingEdge> | null>(null);

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    const position = flowRef.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (!position) {
      return;
    }

    const paletteData = event.dataTransfer.getData("application/carvingen-node");
    if (paletteData) {
      const parsed = JSON.parse(paletteData) as {
        nodeType: "prompt" | "image" | "mesh" | "viewer" | "vision";
      };
      addCanvasNode(parsed.nodeType, position);
      return;
    }

    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const node = addCanvasNode("image", position);
      updateImageNode(node.id, {
        isUploading: true,
        fileName: file.name,
      });

      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { assetId?: string; url?: string; error?: string };

      if (response.ok && payload.assetId) {
        updateImageNode(node.id, {
          assetId: payload.assetId,
          previewUrl: payload.url ?? null,
          isUploading: false,
          errorMessage: null,
        });
      } else {
        updateImageNode(node.id, {
          isUploading: false,
          errorMessage: payload.error ?? "Upload failed.",
        });
      }
    }
  }, []);

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (connectionState.isValid || !connectionState.fromNode || !flowRef.current) {
        return;
      }

      const point =
        "changedTouches" in event
          ? { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 }
          : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };

      const position = flowRef.current.screenToFlowPosition(point);
      addConnectedPromptFromSource(connectionState.fromNode.id, position);
    },
    [],
  );

  return (
    <div className="h-full flex-1" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
      <ReactFlow
        data-testid="canvas-flow"
        nodeTypes={nodeTypes as NodeTypes}
        nodes={[...graph.nodes] as CarvingNode[]}
        edges={[...graph.edges] as CarvingEdge[]}
        onInit={(instance) => {
          flowRef.current = instance;
          instance.setViewport(graph.viewport);
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={commitGraphInteraction}
        onSelectionDragStop={commitGraphInteraction}
        onConnect={(connection) => {
          connectNodes(connection);
        }}
        onConnectEnd={onConnectEnd}
        connectionMode={ConnectionMode.Loose}
        fitView
        defaultEdgeOptions={{
          type: "step",
          animated: false,
          style: {
            stroke: "#000",
            strokeWidth: 3,
          },
        }}
        onMoveEnd={(_event, viewport) => {
          updateViewport(viewport);
          commitGraphInteraction();
        }}
      >
        <Controls />
        <MiniMap />
        <Background color="#00000022" gap={18} size={2} />
      </ReactFlow>
    </div>
  );
}
