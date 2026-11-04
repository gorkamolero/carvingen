import { CharacterNode } from "@/features/canvas/nodes/CharacterNode";
import { VideoNode } from "@/features/canvas/nodes/VideoNode";
import { ImageNode } from "@/features/canvas/nodes/ImageNode";
import { MeshNode } from "@/features/canvas/nodes/MeshNode";
import { PromptNode } from "@/features/canvas/nodes/PromptNode";
import { VisionNode } from "@/features/canvas/nodes/VisionNode";
import { ViewerNode } from "@/features/canvas/nodes/ViewerNode";

import { MotionNode } from "@/features/canvas/nodes/MotionNode";

export const nodeTypes = {
  motion: MotionNode,
  multiview: CharacterNode,
  bake: CharacterNode,
  rig: CharacterNode,
  animate: CharacterNode,
  animation: CharacterNode,
  export: CharacterNode,

  prompt: PromptNode,
  image: ImageNode,
  mesh: MeshNode,
  viewer: ViewerNode,
  vision: VisionNode,
  video: VideoNode,
} as const;
