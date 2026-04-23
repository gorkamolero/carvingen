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
import { uploadImageAsset } from "@/lib/assets/upload-client";
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
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";

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
      const toastId = showLoadingToast({
        title: "Uploading dropped image",
        description: file.name,
      });

      try {
        const payload = await uploadImageAsset(file);
        updateImageNode(node.id, {
          assetId: payload.assetId,
          previewUrl: payload.url ?? null,
          isUploading: false,
          errorMessage: null,
        });
        showSuccessToast(toastId, {
          title: "Image added to canvas",
          description: file.name,
        });
      } catch (error) {
        updateImageNode(node.id, {
          isUploading: false,
          errorMessage: getErrorMessage(error, "Upload failed."),
        });
        showErrorToast(toastId, {
          title: "Drop upload failed",
          description: getErrorMessage(error, "Upload failed."),
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
        minZoom={0.05}
        maxZoom={3}
        defaultEdgeOptions={{
          type: "step",
          animated: false,
          style: {
            stroke: "#0a0a0a",
            strokeWidth: 4,
          },
        }}
        onMoveEnd={(_event, viewport) => {
          updateViewport(viewport);
          commitGraphInteraction();
        }}
      >
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.04)" nodeStrokeColor="#0a0a0a" nodeStrokeWidth={3} nodeColor="#ffd400" />
        <Background color="#0a0a0a33" gap={20} size={1.5} />
      </ReactFlow>
    </div>
  );
}
