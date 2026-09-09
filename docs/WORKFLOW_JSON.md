# Workflow JSON

Carvingen workflows can be created from JSON with:

```bash
pnpm workflow examples/workflows/image-to-video.seedance.json --dry-run
pnpm workflow path/to/workflow.json --base-url http://127.0.0.1:3001 --public-url https://your-tunnel.example
pnpm workflow path/to/workflow.json --fal-storage-inputs
```

`--dry-run` validates the workflow and prints the graph that would be saved. It does not upload assets, create projects, call fal, or write to the database.
`--fal-storage-inputs` uploads local workflow assets to fal storage and uses those remote URLs for provider inputs. Use it for CLI runs when a public tunnel is unavailable or stale.

For character batches, use one manifest and run the same generated workflow per character:

```bash
pnpm characters output/characters/orange-guy/manifests/character-batch.json --plan
pnpm characters output/characters/orange-guy/manifests/character-batch.json --concurrency 3
```

The manifest supports `concurrency` so 3-4 characters can run in parallel with a bounded provider load. Each character supplies `front`, `back`, `left`, and `right` view paths plus optional height, target polycount, model URL, rig task id, and animation overrides.

The character pipeline is intentionally staged:

1. Meshy multiview low-poly textured GLB via fal storage inputs.
2. Native Meshy rigging on the generated GLB.
3. Native Meshy animation tasks against the single rig task.
4. Per-character `viewer.html` with all generated animated GLBs.
5. Optional game packing into one deduplicated GLB with all animation clips.

`--plan` validates the manifest and prints the expected steps and estimated Meshy credits without spending provider credits.

Fresh character estimate with the default 7-animation pack:

```text
30 credits low-poly textured multiview mesh
 5 credits rigging
21 credits seven animations
=56 credits per character
```

If a character has `modelUrl`, mesh generation is skipped. If it has `rigTaskId`, rigging is skipped.

After a character finishes, pack the duplicated animation GLBs into a game-prototype asset:

```bash
pnpm character:pack output/characters/orange-guy
pnpm character:pack output/characters/orange-guy --out output/characters/orange-guy/game/orange-guy.game-small.glb --texture-size 1024 --texture-quality 70
```

This writes:

```text
output/characters/orange-guy/game/orange-guy.game.glb
output/characters/orange-guy/game/orange-guy.game.manifest.json
output/characters/orange-guy/game/orange-guy.game.viewer.html
```

The packer uses one animated GLB as the base mesh/skeleton, copies the other clips into that document, then runs glTF Transform `resample`, `weld`, `quantize`, `textureCompress`, `dedup`, and `prune`. It also writes a local packed-GLB viewer so animation playback can be checked against the actual game asset, not the duplicated Meshy source files.

On the orange-guy test:

```text
8 duplicated animation GLBs: 58.01 MB
deduped GLB with original PNG: 7.68 MB
1024 WebP + quantized GLB: 0.74 MB
512 WebP + quantized GLB: 0.67 MB
```

Use 1024 WebP as the default game target; 512 saves little extra and loses texture detail.

Against the current train game assets in `/Users/gorkolas/www/train/public/animals-baked-run`, the hooked animal directories are roughly:

```text
dog: 880K
horse: 1.1M
cow/rhino/elephant bake: 1.3M
tiger: 2.0M
```

The current optimized character packs are under that range:

```text
orange-guy.game-small.glb: 764K, 3,066 triangles, 8 animations
old-staff-man.game-small.glb: 708K, 3,009 triangles, 7 animations
```

Minimal manifest shape:

```json
{
  "concurrency": 3,
  "falStorageInputs": true,
  "makeViewer": true,
  "animationFps": 30,
  "animations": [
    { "actionId": 669, "name": "Slow_Orc_Walk_inplace", "role": "locomotion_inplace" },
    { "actionId": 54, "name": "Squat_Stance", "role": "squat" },
    { "actionId": 172, "name": "Electrocution_Reaction", "role": "hazard_reaction" }
  ],
  "mesh": {
    "targetPolycount": 3000,
    "heightMeters": 1.45,
    "enablePbr": false
  },
  "characters": [
    {
      "id": "character-01",
      "name": "Character 01",
      "views": {
        "front": "output/characters/character-01/views/front.png",
        "back": "output/characters/character-01/views/back.png",
        "left": "output/characters/character-01/views/left.png",
        "right": "output/characters/character-01/views/right.png"
      },
      "heightMeters": 1.45
    }
  ]
}
```

## Top Level

```json
{
  "project": { "name": "Workflow test", "mode": "create" },
  "assets": [],
  "nodes": [],
  "edges": [],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

- `project.mode`: `create` or `update`. `update` requires `project.id`.
- `assets`: local files to upload before graph creation. Currently image assets are supported.
- `nodes`: canvas nodes to create.
- `edges`: React Flow-style connections between handles.
- `viewport`: optional canvas viewport.

## Assets

```json
{ "id": "front", "path": "./examples/assets/front.png", "kind": "image" }
```

Asset ids are workflow-local names. Image nodes reference them with `"asset": "front"`.

## Nodes

Every node supports:

```json
{
  "id": "stable_node_id",
  "type": "image",
  "position": { "x": 120, "y": 160 },
  "data": {},
  "run": false
}
```

`run: true` is only valid for runnable provider nodes: `prompt`, `video`, `mesh`, and `vision`.

### Image

```json
{
  "id": "image_front",
  "type": "image",
  "asset": "front",
  "position": { "x": 120, "y": 160 }
}
```

### Prompt

Prompt nodes use the existing image-generation adapter.

```json
{
  "id": "prompt_1",
  "type": "prompt",
  "run": true,
  "data": {
    "text": "A hand-carved walnut raven on a cream background",
    "model": "fal-ai/nano-banana-2",
    "aspectRatio": "1:1",
    "resolution": "1K",
    "seed": null
  }
}
```

### Video

Video nodes support Seedance 2.0 text/image/reference modes plus Veo 3.1 Fast Reference.

```json
{
  "id": "video_1",
  "type": "video",
  "run": true,
  "data": {
    "model": "seedance-2.0",
    "mode": "image",
    "tier": "fast",
    "text": "Slow cinematic orbit around the carving",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "duration": "8",
    "generateAudio": true,
    "seed": null
  }
}
```

For Veo:

```json
{
  "model": "veo3.1-fast-reference",
  "mode": "reference",
  "tier": "fast",
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "duration": "8s"
}
```

### Mesh

Mesh nodes support Meshy and Hunyuan 3D Pro.

```json
{
  "id": "mesh_1",
  "type": "mesh",
  "run": true,
  "data": {
    "provider": "hunyuan",
    "mode": "preview",
    "hunyuanViewSlots": ["front", "left", "back"],
    "hunyuanGenerateType": "Normal",
    "hunyuanEnablePbr": true,
    "hunyuanFaceCount": 500000
  }
}
```

Meshy v6 also supports the current fal beta controls:

```json
{
  "provider": "meshy",
  "mode": "preview",
  "meshyUseMultiview": true,
  "meshyPolyMode": "low",
  "meshyTopology": "triangle",
  "meshyTargetPolycount": 3000,
  "meshySymmetryMode": "auto",
  "meshyShouldRemesh": true,
  "meshyShouldTexture": true,
  "meshyEnablePbr": false,
  "meshyPoseMode": "t-pose",
  "meshyEnableRigging": true,
  "meshyRiggingHeightMeters": 1.7,
  "meshyEnableAnimation": true,
  "meshyAnimationActionId": 1001
}
```

`meshyUseMultiview` switches Meshy to `fal-ai/meshy/v6/multi-image-to-3d` and sends up to the first four connected images as `image_urls`. `meshyPolyMode: "low"` defaults the fal `target_polycount` to `3000`; you can override that with `meshyTargetPolycount`.

Animation is Meshy-only. `meshyEnableAnimation` sends fal's `enable_animation` and automatically forces `enable_rigging`; `meshyAnimationActionId` is the Meshy animation-library action id.

Connected images map to selected Hunyuan view slots in order. `front` is required and is always first.

### Vision

```json
{
  "id": "vision_1",
  "type": "vision",
  "run": true,
  "data": {
    "question": "Describe the object and material details.",
    "model": "google/gemini-2.5-flash"
  }
}
```

## Handles

- Image-like flow: `image-out` -> `image-in`
- Mesh viewer flow: `glb-out` -> `glb-in`

Edges infer their `data.kind` from the handles.

```json
{
  "source": "image_front",
  "sourceHandle": "image-out",
  "target": "video_1",
  "targetHandle": "image-in"
}
```

## Output

The CLI prints JSON:

```json
{
  "projectId": "...",
  "projectName": "...",
  "dryRun": false,
  "nodesRun": ["video_1"],
  "outputs": {
    "video_1": [
      { "assetId": "...", "kind": "video", "url": "/api/assets/..." }
    ]
  },
  "graph": {}
}
```
