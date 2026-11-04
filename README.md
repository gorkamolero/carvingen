# Carvingen

A node canvas for AI image, video and 3D generation. It was built for wood-carving studios: a concept goes from a first image to a 3D model, and the carvers put on 3D glasses, look at the model from every side and carve from it. Studios in Kentucky and Missouri work this way.

It is not only for carvers. Anyone who wants to branch an idea, keep every version and end up with a 3D model can use it.

![An owl made on the canvas: prompt nodes with their images, a branch, a Mesh node and a Viewer node](docs/images/owl-canvas.jpg)

*One real run: a first image, an edit, two branches, a simplified version, then a Meshy v6 model in the Viewer. The workflow is in [`examples/workflows/owl-landing.json`](examples/workflows/owl-landing.json).*

## Why a canvas

The first pieces were made by hand: prompts in a chat, images saved in folders, a separate tool for the 3D model. A chat is linear, so you lose which image came from which. On the canvas every prompt is a node, every image hangs off the one it came from, and nothing is thrown away. You can branch, go back, compare siblings and carry any image forward as a reference. It is a node workflow in the way ComfyUI is, built to take a concept all the way to a 3D model.

## What is in it

- **Nodes:** Image, Prompt, Vision, Video, Mesh, Multi-view, Bake, Rig, Animate, Animation upload, Engine export and Viewer. Up to 14 reference images on Nano Banana 2. Every run stays in the node's history. Undo and redo cover every change to the graph.
- **Models:** GPT Image · Codex subscription locally; through [fal](https://fal.ai): Flux Kontext Pro, Nano Banana 2 and Pro, GPT Image 2, Veo 3.1, Seedance, Meshy v6, Hunyuan 3D, Tripo P2 and H3.1.
- **3D:** GLB, FBX, USDZ, OBJ and STL downloads, and a model viewer.
- **Scripts:** run a whole canvas from JSON (`pnpm workflow`), and batch characters through multi-view, Meshy rigging and animation, and packing for games (`pnpm characters`, `pnpm character:pack`). See [`docs/WORKFLOW_JSON.md`](docs/WORKFLOW_JSON.md).
- **Stack:** Next.js 16, React 19, React Flow, Valtio, TanStack Query, SQLite with Drizzle, and a local folder for generated assets.

## Run it

```bash
pnpm install
pnpm dev:local
```

Open http://localhost:3001. Fal generation needs a `FAL_KEY` in a local `.env.local` and costs money. Codex image generation uses your signed-in ChatGPT subscription with $0 fal cost. Each Run shows its estimate. Local state defaults to `./carvingen.sqlite` and `./outputs/`, both git-ignored.

For local development with generation, also set:

```bash
FAL_PROXY_ALLOW_UNAUTHENTICATED=true
MAX_REMOTE_ASSET_BYTES=104857600
REMOTE_ASSET_ALLOWED_HOSTS=fal.media,v2.fal.media,v3.fal.media,storage.googleapis.com,cdn.meshy.ai,assets.meshy.ai
```

Keep `FAL_PROXY_ALLOW_UNAUTHENTICATED=false` on anything deployed. The fal proxy only forwards the image, mesh, video and vision endpoints Carvingen uses, and saved assets must come from the allowed hosts, with matching types and bounded sizes.

## Try the owl workflow

```bash
pnpm workflow examples/workflows/owl-landing.json --dry-run
pnpm workflow examples/workflows/owl-landing.json --base-url http://127.0.0.1:3001 --fal-storage-inputs
```

The dry run checks the graph and calls nothing. The real run makes five images and one 3D model on fal, which costs a few dollars.

## Checks

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

`/portfolio-demo` is a read-only page with fixture data and no provider calls, for showing the layout without spending anything.

## From a character image to a game-ready FBX

![The character chain on the canvas: a prompt image, Multi-view, a Tripo mesh, a Blender bake, Rig, Animate and Engine export, each followed by a Viewer](docs/images/character-atlas-canvas.png)

The canvas also takes one character image all the way to rigged, animated FBX files for a game engine:

1. **Multi-view** turns the image into T-pose front, side and back views and separate equipment cutouts, with Nano Banana 2.
2. **Mesh** builds the model with Tripo P2 or H3.1 (face count, quad topology, PBR and texture options), Meshy v6 or Hunyuan 3D.
3. **Bake** brings it down to a triangle budget in local Blender and bakes the colour onto the low-poly mesh. Tripo remesh is the other engine.
4. **Rig** adds a humanoid skeleton through Meshy, with Mixamo-style bone names.
5. **Animate** applies presets from Meshy's library of 656 clips in one call, and retargets your own FBX, BVH or GLB clips in Blender.
6. **Engine export** renames the bones for Unity Humanoid or Unreal UE5, checks the triangle budget, and writes one FBX per clip plus a manifest.

The Viewer plays the clips. One character costs about $2.22 on fal; Blender steps are free. Blender 5 must be installed (`BLENDER_PATH`, default `/opt/homebrew/bin/blender`).

```bash
pnpm workflow examples/workflows/character-atlas.json --dry-run
pnpm exec tsx scripts/blender-smoke.ts
```

The dry run checks the chain without spending; the smoke test checks the Blender steps on a generated mesh. Details are in [`docs/CHARACTER_PIPELINE.md`](docs/CHARACTER_PIPELINE.md), and what the verification run cost is in [`docs/COSTS.md`](docs/COSTS.md).

### GPT Image · Codex subscription

GPT Image · Codex subscription (`codex/gpt-image`) requires the Codex CLI signed in with a ChatGPT plan on the machine running the server. It takes about a minute per image and has $0 fal cost; set `CODEX_PATH` to override the default `codex` binary. Prompt supports up to 10 references and 1:1, 3:4, 4:3, 9:16 and 16:9, with no resolution control. Multi-view can select this engine instead of the default Nano Banana 2; each view and equipment cutout runs sequentially, retaining the same artifact names. Jobs run in isolated directories with a ten-minute timeout and a shared limit of two concurrent images.
