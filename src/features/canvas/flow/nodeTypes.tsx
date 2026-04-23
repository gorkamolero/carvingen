import { ImageNode } from "@/features/canvas/nodes/ImageNode";
import { MeshNode } from "@/features/canvas/nodes/MeshNode";
import { PromptNode } from "@/features/canvas/nodes/PromptNode";
import { VisionNode } from "@/features/canvas/nodes/VisionNode";
import { ViewerNode } from "@/features/canvas/nodes/ViewerNode";

export const nodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  mesh: MeshNode,
  viewer: ViewerNode,
  vision: VisionNode,
} as const;
