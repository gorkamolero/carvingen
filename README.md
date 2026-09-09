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

Cmd+Z / Cmd+Shift+Z undo/redo every graph mutation - connect/disconnect, edit, model change, delete.

## Technical shape

- Next.js 16, React 19, React Flow, Valtio, TanStack Query, SQLite/Drizzle, and local filesystem asset persistence.
- fal.ai-backed image, vision, video, and Meshy image-to-3D workflows through one server-side provider boundary.
- Prompt, image, mesh, video, vision, and viewer node types with graph serialization and workflow-runner support.
- Unit tests cover graph serialization, connection rules, provider request builders, and workflow execution paths.

## Local development

```bash
pnpm install
pnpm dev:local
```

Provider-backed generation requires a local `.env.local` with `FAL_KEY`. Local state defaults to `./carvingen.sqlite` and `./outputs/`; both are ignored because they can contain private prompts, generated media, and provider outputs.

For local provider-backed development, set:

```bash
FAL_PROXY_ALLOW_UNAUTHENTICATED=true
MAX_REMOTE_ASSET_BYTES=104857600
REMOTE_ASSET_ALLOWED_HOSTS=fal.media,v2.fal.media,v3.fal.media,storage.googleapis.com,cdn.meshy.ai,assets.meshy.ai
```

Keep `FAL_PROXY_ALLOW_UNAUTHENTICATED=false` for any public-demo or deployed recruiter environment. The fal proxy allowlists only the image, mesh, video, and vision endpoints Carvingen uses, and remote asset persistence accepts only expected provider/CDN hosts, known asset kinds, matching MIME types, and bounded file sizes.

Useful checks:

```bash
pnpm test
pnpm lint
pnpm build
```

## Portfolio demo

`/portfolio-demo` is a public-safe, fixture-backed proof route for recruiters. It renders the canvas workflow with Image, Prompt, Mesh, and Viewer nodes, but it uses inline fake SVG assets instead of local project data, generated outputs, provider files, or client media.

The route proves the graph shape, node taxonomy, visual workflow, and 3D handoff surface. It deliberately withholds real provider execution, local SQLite state, private prompts, generated media, and provider-spend controls. The run controls are disabled and the e2e test asserts the route does not call `/api/projects`, `/api/jobs`, `/api/fal`, or `/api/assets/persist`.

Run it locally with:

```bash
pnpm dev:local
open http://localhost:3001/portfolio-demo
```

## Publication status

This repo is not ready to make public as-is. Before any visibility change, scrub local/generated artifacts, keep `.env.local`, SQLite files, `outputs/`, `output/`, and `tmp/` out of source control, and review example workflows for private prompts or third-party media.
