# Costs

Every paid fal call made while building and verifying the character pipeline. Prices are fal's published prices on each model page (checked 3 November 2026). fal's account usage API was not available to the test key, so the totals are list prices, not invoice lines.

## Prices used by the nodes

| Endpoint | Price | Used by |
|---|---|---|
| `fal-ai/nano-banana-2` | $0.08 per image | Prompt node (reference image) |
| `fal-ai/nano-banana-2/edit` | $0.08 per image | Multi-view node (one call per view or cutout) |
| `tripo3d/p2/image-to-3d` | $1.00 without textures, $1.10 fast or standard textures, $1.20 detailed, $1.30 extreme; quad is free | Mesh node, Tripo P2 |
| `tripo3d/h3.1/image-to-3d` | $0.20 without textures, $0.30 standard, $0.40 HD; +$0.20 detailed geometry, +$0.05 quad | Mesh node, Tripo H3.1 |
| `fal-ai/meshy/rigging` | $0.20 per request (+$0.12 with its single animation). fal's pricing API lists $0.80. | Rig node |
| `fal-ai/meshy/rigging/multi-animation` | $0.20 per request + $0.12 per clip | Animate node |
| `tripo3d/tripo/remesh` | not published on the model page; pricing API lists $0.01 per unit | Bake node, Tripo engine |
| Local Blender | $0 | Bake (Blender engine), custom clip retargeting, Engine export |

## Verification runs, 3 November 2026

| Time | Call | Result | Cost |
|---|---|---|---|
| 15:47 | nano-banana-2, reference image | ok | $0.08 |
| 15:47 | nano-banana-2/edit ×5, multi-view | ok, but the job was marked failed by a server status check | $0.40 |
| 15:51 | nano-banana-2, reference image | ok | $0.08 |
| 15:51 | nano-banana-2/edit ×5, multi-view | ok | $0.40 |
| 15:52 | tripo P2, standard textures, PBR | ok, 31,702 triangles | $1.10 |
| 15:54 | meshy rigging | 422: model URL was a localhost address | $0–0.80 |
| 15:56 | nano-banana-2, reference image | ok | $0.08 |
| 15:56 | nano-banana-2/edit ×5, multi-view (fixed side-view and cutout prompts) | ok | $0.40 |
| 15:57 | tripo P2, standard textures, PBR | ok | $1.10 |
| 15:59 | meshy rigging | 422: uploaded file had no `.glb` extension | $0–0.80 |
| 16:01 | meshy rigging, from the canvas | ok, 24 bones | $0.20–0.80 |
| 16:31 | meshy multi-animation, Idle + Casual_Walk | ok, clips 4.0 s and 4.2 s | $0.44 |
| 16:35 | meshy multi-animation, Idle + Casual_Walk (rerun for clip names) | ok | $0.44 |

**Total: $4.72 at the model-page prices, $6.92 if fal bills the $0.80 rigging rate for all three rigging calls.** Both are under the $10 test budget.

One full character on the final code: reference image $0.08, five multi-view images $0.40, Tripo P2 $1.10, Blender bake $0, rig $0.20, two clips $0.44, export $0. About **$2.22**.
