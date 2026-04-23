import { z } from "zod";

import {
  handleIdSchema,
  imageNodeDataSchema,
  meshNodeDataSchema,
  nodeTypeSchema,
  promptNodeDataSchema,
  visionNodeDataSchema,
  viewerNodeDataSchema,
  type CarvingEdge,
  type CarvingNode,
  type ProjectGraph,
} from "@/lib/graph/types";

const nodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("prompt"),
    position: z.object({ x: z.number(), y: z.number() }),
    data: promptNodeDataSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("image"),
    position: z.object({ x: z.number(), y: z.number() }),
    data: imageNodeDataSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("mesh"),
    position: z.object({ x: z.number(), y: z.number() }),
    data: meshNodeDataSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("viewer"),
    position: z.object({ x: z.number(), y: z.number() }),
    data: viewerNodeDataSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("vision"),
    position: z.object({ x: z.number(), y: z.number() }),
    data: visionNodeDataSchema,
  }),
]);

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: handleIdSchema,
  target: z.string(),
  targetHandle: handleIdSchema,
  data: z.object({ kind: z.enum(["image", "glb"]) }).optional(),
});

export const projectGraphSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
});

export function parseNodeData(type: z.infer<typeof nodeTypeSchema>, dataJson: string) {
  const data = JSON.parse(dataJson);

  switch (type) {
    case "prompt":
      return promptNodeDataSchema.parse(data);
    case "image":
      return imageNodeDataSchema.parse(data);
    case "mesh":
      return meshNodeDataSchema.parse(data);
    case "viewer":
      return viewerNodeDataSchema.parse(data);
    case "vision":
      return visionNodeDataSchema.parse(data);
  }
}

export function serializeNode(node: CarvingNode) {
  return {
    id: node.id,
    type: node.type,
    positionX: node.position.x,
    positionY: node.position.y,
    dataJson: JSON.stringify(node.data),
  };
}

export function deserializeNode(record: {
  id: string;
  type: z.infer<typeof nodeTypeSchema>;
  positionX: number;
  positionY: number;
  dataJson: string;
}) {
  return nodeSchema.parse({
    id: record.id,
    type: record.type,
    position: {
      x: record.positionX,
      y: record.positionY,
    },
    data: parseNodeData(record.type, record.dataJson),
  }) as CarvingNode;
}

export function serializeEdge(edge: CarvingEdge) {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? "",
    target: edge.target,
    targetHandle: edge.targetHandle ?? "",
    dataJson: JSON.stringify(edge.data ?? {}),
  };
}

export function deserializeEdge(record: {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  dataJson?: string | null;
}) {
  const rawData = record.dataJson ? JSON.parse(record.dataJson) : { kind: "image" };

  return edgeSchema.parse({
    id: record.id,
    source: record.source,
    sourceHandle: record.sourceHandle,
    target: record.target,
    targetHandle: record.targetHandle,
    data: rawData,
  }) as CarvingEdge;
}

export function validateProjectGraph(graph: ProjectGraph) {
  return projectGraphSchema.parse(graph);
}
