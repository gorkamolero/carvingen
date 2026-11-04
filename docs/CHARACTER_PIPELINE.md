# Character pipeline implementation

The canvas and workflow runner share the same server-managed job executor. No dependencies were added. The example is `examples/workflows/character-atlas.json`.

## Nodes and endpoints

| Node | Execution | Output |
|---|---|---|
| Mesh / Tripo P2 | `tripo3d/p2/image-to-3d` | Every returned mesh variant and preview; convert FBX-only results to GLB locally |
| Mesh / Tripo H3.1 | `tripo3d/h3.1/image-to-3d`, optionally `tripo3d/h3.1/multiview-to-3d` | Same; multi-view order front, left, back, right |
| Multi-view | `fal-ai/nano-banana-2/edit` (default) or `codex/gpt-image`, one request per view/cutout | Front, right, optional back, one image per comma-separated equipment item |
| Bake | Blender `bake.py` or `tripo3d/tripo/remesh` | Blender: GLB, FBX, base-color PNG, actual triangle count. Tripo: returned artifacts, local GLB conversion if needed |
| Rig | `fal-ai/meshy/rigging` | GLB, FBX, basic animations, actual GLB joint names/count, rig task ID |
| Animate | `fal-ai/meshy/rigging/multi-animation`; custom inputs use Blender `retarget.py` | Per-clip files, combined animation GLB, ZIP |
| Animation | `/api/assets/upload` | Validated FBX/BVH/GLB upload; no generation |
| Engine export | Blender `export.py` | GLB/FBX set, manifest, ZIP, actual budget pass/fail |
| Viewer | model-viewer | Clip dropdown and play/pause when GLB contains animations |

All new runnable nodes and Mesh POST `/api/jobs/<kind>`, receive a job ID immediately, then poll GET `/api/jobs/<id>`. Runs append assets to history. Failure leaves prior output intact. Active job IDs persist with the graph. SQLite stores queued/running/terminal state and progress in the existing response-summary column. Jobs execute in the long-running Node server, not in an HTTP request's synchronous work. Server restart interrupts work and reports an explicit failure instead of silently re-submitting; provider request IDs remain in the job output directory for reconciliation. This is not a durable distributed worker.

## Verified schema facts (2026-11-03)

Raw free GET responses are in `docs/fal-schemas/`.

- P2 uses `image_url`, `face_limit` (48–50000; quads ≤25000), `quad`, `texture`, `pbr`, `texture_quality` (fast/standard/detailed/extreme), `texture_version`, `delight`, `export_uv`, `export_orientation`, `auto_size`, `model_seed`, `texture_seed`. Fast texture requires `v3.5-20260815`. PBR enables textures. There is no output-format or smart-low-poly field; the separate remesh endpoint is the smart low-poly operation. Returned `model_mesh` can be GLB or FBX, with `model_urls` variants and `rendered_image`.
- H3.1 uses `image_url` or `image_urls` (2–4 ordered views), `face_limit` (1000–2000000), `quad`, `texture`, `pbr`, `texture_quality` and `geometry_quality` (standard/detailed), `texture_alignment`, `orientation`, `auto_size`, and geometry/texture seeds.
- Remesh uses `mesh_url`, `face_limit` (500–20000, or ≤10000 for quads), `quad`, `bake: true`. Quad output forces FBX. `part_names` is optional but not exposed because the graph has no segmentation node.
- Rig uses `model_url` (humanoid GLB), `height_meters`, `enable_animation: false`. Its response includes `rig_task_id`, rigged files and basic animations. Bone names are inspected from the actual GLB skin, never guessed.
- Multi-animation uses `model_url`, `height_meters`, `animation_action_ids`: IDs 0–696, maximum 10 distinct IDs, duplicates removed. It rigs the model again and does **not** accept `rig_task_id`. Native Meshy task reuse in the older scripts is a different API and is not silently substituted. Presets come from the published [Meshy library](https://docs.meshy.ai/en/api/animation-library): 656 published entries within fal's accepted range. The numeric field also permits valid IDs absent from that list.
- v2.5 multi-view schema was fetched, but that optional legacy engine was not added. H3.1 multi-view is supported instead. No unverified Tripo rig endpoint was added.
- Examples return files from fal.media (including v3b.fal.media), already covered by the existing suffix-based allowlist; no speculative CDN hosts were added. Additional observed hosts can be configured with `REMOTE_ASSET_ALLOWED_HOSTS`.

## Prices

| Endpoint | Price on the fal model page (3 November 2026) |
|---|---|
| Nano Banana 2 generation / edit | $0.08 per image |
| Tripo P2 | $1.00 without textures; $1.10 fast or standard, $1.20 detailed, $1.30 extreme textures; quad free |
| Tripo H3.1 | $0.20 without textures, $0.30 standard, $0.40 HD; +$0.20 detailed geometry, +$0.05 quad |
| Tripo remesh | not published on the model page; pricing API lists $0.01 per unit |
| Meshy rig | $0.20 per request (fal's pricing API lists $0.80) |
| Meshy multi-animation | $0.20 per request + $0.12 per clip |
| Blender / uploads / export | $0 provider cost |

Run labels and the dry run use these rates (`src/lib/fal/pricing.ts`). The example comes to about $2.22 per character. Tripo remesh is the only node still shown without a total. The verified run and its spend are in [COSTS.md](COSTS.md).

## Robustness

- Run buttons read the live graph when clicked, so a node uses an upstream rerun's outputs even if it has not re-rendered.
- Provider polling and result fetches retry dropped connections; a network blip no longer fails a job the provider is still running and billing.
- Multi-view's side view is the character's right side, facing screen left; Tripo multi-view gets it unmirrored in its left slot, with front and back. Real runs showed a mirrored profile there leaves a ghost face on the back of the head.

## Local processing and limits

`BLENDER_PATH` defaults to `/opt/homebrew/bin/blender`. Scripts target Blender 5.x. Each job uses an isolated storage directory, fixed script names, JSON arguments and `spawn` with no shell. A missing binary produces a clear job failure. A 30-minute limit bounds each subprocess/provider poll. Imported file extensions are reconstructed from asset types; FBX/GLB uploads are checked for signatures, BVH for its hierarchy header, and the existing byte limit applies.

Bake joins static meshes, applies an optional turn about the up axis (some image-to-3D results face +X instead of the glTF front, which makes riggers place the legs sideways), applies transforms, decimates to a triangle target, optionally retains UVs, otherwise smart-projects, and bakes selected high-poly diffuse color to active low-poly on CPU. It exports embedded texture GLB/FBX plus PNG. It rejects skinned meshes: bake before rigging. Decimation is a triangle budget tool, not anatomical edge-loop retopology. Texture sizes are 1024/2048/4096.

Custom retargeting maps Mixamo/Humanoid names, transfers rotation deltas between rest-bone coordinate frames, scales hips translation and keys every frame on the destination. It rejects fewer than two matching bones. Complex rigs, constraints and markedly different proportions still need visual review; this is not IK-based contact correction.

Engine export renames bones and vertex groups through Blender's armature rename behavior. It preserves the existing hierarchy. Spine bones are named by their position from the hips, because Meshy numbers its spine top-down (Hips → Spine02 → Spine01 → Spine); they become Spine, Chest and UpperChest (Unity) or spine_01–03 (Unreal). Each clip is exported to its own file named after the clip, with no actions carried over from other clips. Unity still requires Humanoid Avatar setup; Unreal still requires IK Retargeter setup. Naming conversion does not synthesize a complete UE5 mannequin hierarchy or twist/IK bones. Budget failure is reported in the node/manifest; files are retained for inspection.

The combined GLB reuses the packing CLI's accessor/channel-copy logic, now shared in `src/lib/character/pack.ts`. Matching uses bone/node names; incompatible skeletons fail explicitly instead of matching unrelated node indices. ZIP files use a dependency-free STORE writer.

Files made locally, such as Bake outputs, are uploaded to fal storage under their own file name before a fal step reads them; Meshy reads the format from the URL's extension and rejects a GLB without one. Remote provider assets keep their original source URL, and a public `PUBLIC_URL` is used when set. Keep the local Node server alive during jobs.

## Verification

`pnpm exec tsx scripts/blender-smoke.ts` generates an image-textured high-resolution sphere and animated Mixamo-named armature, bakes to 2000 triangles, exports renamed bones, retargets a clip, reopens both GLB and FBX outputs in Blender, checks materials/triangles/bones/animation, checks the manifest and packs two animations into one GLB. It removes only its own temporary directory. No binary fixtures are committed.

Unit tests cover payloads, limits, artifact extraction, graph connection rules, front-view selection, dry-run planning, append-only history, progress parsing, bone maps, ZIP structure, pricing, private-URL detection and clip naming. Provider generation is mocked.

A real run on 3 November 2026 took one generated character through the whole chain on fal and local Blender: Tripo P2 returned 31,702 triangles, the Blender bake brought it to 12,000 with a 2048 texture, Meshy rigged it with 24 bones, and Animate added Idle (4.0 s) and Casual_Walk (4.2 s). Engine export (Unity) wrote `Idle.fbx` and `Casual_Walk.fbx`. Loading each FBX headless in Blender showed one skinned armature, 24 bones with Unity names (Hips → Spine → Chest → UpperChest → Neck), 12,000 triangles and exactly one clip per file (97 and 100 frames). Each result was opened in a Viewer on the canvas, and the Animate Viewer switches between both clips. The canvas is in [`images/character-atlas-canvas.png`](images/character-atlas-canvas.png).

### GPT Image · Codex subscription

GPT Image · Codex subscription (`codex/gpt-image`) requires the Codex CLI signed in with a ChatGPT plan on the machine running the server. It takes about a minute per image and has $0 fal cost; set `CODEX_PATH` to override the default `codex` binary. Prompt supports up to 10 references and 1:1, 3:4, 4:3, 9:16 and 16:9, with no resolution control. Multi-view can select this engine instead of the default Nano Banana 2; each view and equipment cutout runs sequentially, retaining the same artifact names. Jobs run in isolated directories with a ten-minute timeout and a shared limit of two concurrent images.

### Native Tripo rigs and clips

Rig now offers Meshy (default) and Tripo. Set server environment `TRIPO_API_KEY` to use
Tripo's own v3 humanoid API, billed in Tripo credits rather than fal. Tripo uploads the
connected GLB, checks biped riggability, and requests Mixamo naming. The returned GLB's
actual bone names and count are shown; finger bones are not guaranteed by the docs.
Animate follows its input rig's engine: Tripo uses the stored rig task ID and its 11 v3
presets, while Meshy keeps its existing library. Each Tripo clip gets one retarget task;
GLB and converted FBX files participate in the existing combined GLB and ZIP outputs.
Run estimates include FBX conversion: 30 credits ($0.30) per rig and 15 ($0.15) per clip.
Custom Animation inputs still use Blender. Workflow jobs and dry-run estimates support
`engine: "tripo"` on Rig and `tripoPresetIds: ["preset:idle", "preset:walk"]` on Animate.
See [request shapes, costs, and verification limits](tripo-api.md).
