# Carvingen

A node-based canvas for carvers to generate carving concepts as images, chain them into variations, and turn the final choice into a 3D model for VR/Oculus viewing.

## Why this exists

Carvers currently iterate on carving ideas inside ChatGPT: prompt, get an image, describe what to change, get another image, lose the thread, start over. The flow is linear, non-visual, and throws away the lineage of "this image came from that image came from that prompt."

Carvingen replaces the chat transcript with a **spatial, branching canvas**. Each prompt is a node. Each generated image is a node. You can branch, rewind, compare siblings, and carry any image forward as a reference for the next prompt — across four image models (ChatGPT Image Gen 2, Nano Banana 2, Nano Banana Pro, Flux Kontext Pro — all via [fal.ai](https://fal.ai)). When you land on the concept, you drop it into a Mesh node (Meshy v6 via fal) and it becomes a turntable-previewable GLB ready for Quest/Oculus.

## Core user journey

1. Open Carvingen. Pick an existing project from the top-bar switcher or create a new one.
2. The left sidebar has four draggable tiles: **Image**, **Prompt**, **Mesh**, **Viewer**. Drag a **Prompt** tile onto the canvas. It has a text area, a model selector (Nano Banana 2 preselected; options include `gpt-image-2`, `nano-banana-pro`, `flux-kontext-pro`), an output slot with a history strip, and a **Run** button.
3. Optionally drag an image file from **Finder** onto the canvas → spawns an **Image node** (or drag the Image tile from the sidebar and pick a file). Wire it into the Prompt node's left handle. HEIC files are auto-converted server-side.
4. Type the prompt, hit **Run**. Image appears in the Prompt node's output slot. Prior runs stack into the history strip below — nothing is ever discarded.
5. From the output's right handle, drag an edge into another Prompt node (or drop on empty canvas to spawn a new one with the edge pre-wired). Type, Run, iterate. Up to 14 references on Nano Banana 2.
6. When a concept is ready, connect the Prompt's output to a **Mesh node** (Meshy v6 image-to-3D via fal). Hit Run. GLB + FBX + USDZ + thumbnail land about a minute later, each with a download button.
7. Wire the Mesh into a **Viewer node** → full-screen `<model-viewer>` with orbit/zoom, Quest-ready `.glb` download.

Cmd+Z / Cmd+Shift+Z undo/redo every graph mutation — connect/disconnect, edit, model change, delete.

## Status

Spec stage. No code yet. See `docs/` for the full spec.
