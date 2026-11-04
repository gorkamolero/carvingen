# Motion

Connect **Rig → Motion → Export** (or Viewer). Motion makes one custom clip from a single two-view video. It renders the rig, uses anymove's unchanged prompt template, requests MiniMax H3 Max on fal, reads human joints with RTMW whole-body through rtmlib on CPU, then fits the rig with anymove's bounded torch optimiser. There is no trained creature reader, LoRA or CUDA dependency. The first passing take stops the job.

## Inputs and cost

Move name names the Blender action and glTF animation; artifact filenames use a lowercase hyphenated slug. First pose selects standing, low crouch, high relaxed stance or prone. Planted selects feet, hands or the lower body. Character height uses the shared pipeline default, 1.8 metres. Subject description describes the existing appearance. Clip seconds trims the beginning to 3–4 seconds (default 3.5), at 24 fps. Take budget is 1–12, default 6. Empty seed base chooses and records a random integer from 1000 to 900000; subsequent takes increment it.

Write one action sentence that starts and ends in the first-frame pose. Name the limbs that move and those that stay still. No props or turning. Example: “From the standing pose, both arms sweep forward and back while both feet remain planted, then the arms return to the starting pose.”

Each submitted five-second, 768P take costs **$0.28**, so six takes cost up to **$1.68 per move**. Local reading, fitting and Blender stages have no provider charge. Request IDs and estimated submitted spend remain in the report even if a later stage fails.

## Frame and scale

The reference is 1536 × 768: two 768-square orthographic views, front on the left, right flank on the right. Z is up, the character faces −Y and its left is +X. Cameras are (0, −20, Zc) and (−20, 0, Zc), where Zc = (656 − 384) × 2.2 / 768 m. Each view spans 2.2 metres vertically; ground is row 656. The wall is RGB (128,130,134), floor band (152,154,158), and divider (34,34,38), four pixels wide centred at x=768.

The skin's rest-pose height determines the metre scale; unskinned meshes are removed. Work, rendering and checks use metres. Export restores object scale 1 and divides root translations and the constant ground lift by the scale, matching Rig's native units.

Video frames are resized to the reference size. One first-frame affine ECC registration is inverted onto every frame's readings. Failed registration is recorded as an identity fallback. Later frames are never realigned. Solver coordinates multiply pixels by 720/768; `MOCAP_CREATURE` supplies widths 720+720, 2.2/720 m/px and ground row 615 to the unchanged vendor module.

## Gates

| Check | Fixed threshold | Catches |
|---|---|---|
| Coverage | ≥80% of frames have ≥80% of 24 core readings above confidence 0.3 | Lost or hidden limbs |
| Facing | ≥80% of frames have anatomical left shoulder right of right shoulder in front, and side shoulder width <max(0.8×front width,18 px) | Turning or reversed anatomy |
| Studio | Floor edge deviation ≤8 px; divider deviation ≤4 px | Camera movement |
| Agreement | Mean scored ankle-height Pearson correlation ≥0.80 | Inconsistent motion between views |
| Fit | Confident front-x ≤3.0 px and side ≤8.5 px in the 1440×720 layout | Unreliable readings or incompatible motion |
| Skin | Minimum evaluated skin z ≥−0.00001 m after one constant lift | Ground penetration |
| Hands/torso | Zero BVH polygon overlaps | Hands passing through body |
| Planted | Maximum displacement within planted runs <2.0 cm | Sliding contacts |
| Reopen | One armature, unchanged bone count, solver bones present, one action, 24 fps, 3–4 s and ground clearance | Broken exports |

An ankle is unscored with fewer than 30 confident pairs or less than 8 px of vertical movement in either view, since both views share the vertical axis and a foot that moves in one view only is reader noise (the front view hides the feet of a prone body), not motion. With the whole body planted both ankles are unscored, because Apply replaces the legs with the first-frame pose. With both unscored, the take proceeds to the fit, whose reprojection gate judges cross-view consistency for every joint. Hand heights are not gated: an arm reaching toward the front camera is foreshortened, and on three paddle takes whose overlays showed the same stroke in both views, wrist heights correlated only 0.27–0.82. No gate is relaxed. Floor edges are sampled at eight columns hugging the frame and divider edges (4, 40, 724, 760, 776, 812, 1496, 1532), rows 450–740, and each frame's floor row is their median, so a limb crossing one column cannot read as camera movement. The divider search uses columns 700–740 in the 1440-wide layout (covering the divider); deviations are converted back to reference pixels.

Root XY ground velocity and linear trend are removed. Body planting freezes root and leg keys at frame zero. A single lift over the whole clip clears the ground; there is no per-frame stabilisation. Failed checks retain their exports for inspection without promoting them to the node output. Failed verification fails the job.

## Local tools

`pnpm motion:setup` creates `.venv-motion/` with pinned CPython 3.12 dependencies. `MOTION_PYTHON` overrides the interpreter. Blender uses `BLENDER_PATH` or `/opt/homebrew/bin/blender`; no Python packages are installed in Blender. `pnpm test:motion` runs synthetic unit tests. `pnpm motion:smoke -- <rigged.glb>` is a free rendered-reader exam, retaining failures under `tmp/` and removing successful scratch output. It renders a smooth two-second loop and encodes it twice to supply the normal 3.5-second trim. No provider is used by the exam.

## Verified runs

Two paid runs on the boy project (Tripo rig, 65 bones, 17,999 triangles), both from the canvas.

| Date | Move | Takes | Result | Cost |
|---|---|---|---|---|
| 3 November 2026 | Paddle, prone, body planted | 6 | all rejected at the gates | $1.68 |
| 4 November 2026 | Pump, low stance, feet planted | 1 | take 1 passed every gate and became the output | $0.28 |

The paddle run proved the gates and found two false alarms, fixed since: a floor-edge sample column crossed by the reaching arm read as camera movement (now eight edge columns and a per-frame median), and ankle agreement was scored on legs the move holds still (now unscored). It also showed the method's limit: a prone body along the camera axis gives the reader no usable signal. The side view hides the far arm and the front view hides the legs, and an offline fit of the best take failed at 5.95 px front-x and 14.8 px side against 3 and 8.5. Prove a move standing or crouched; a lying move needs another source.

The pump run passed on the first take: coverage 100%, facing 100%, ankles unscored (soles planted), studio 1/0 px, reprojection 1.0 px front-x and 4.0 px side, skin z +0.000 m, no hand/torso overlaps, planted drift 0.8 cm over two runs, 84 frames at 24 fps (3.5 s). Both views show a deep crouch rising to half-standing twice, and the Blender contact sheet follows the video. Engine export then wrote `Pump.glb` and `Pump.fbx` for Unity from the clip, 17,999 triangles and 65 Unity-named bones, budget pass.

## Limits

The reader is a human whole-body model; stylised proportions and lying poses can read less reliably. The fitter can leave feet sliding 1–2 cm. The video model may resize the canvas; a camera that moves fails the take. Two-view reading cannot guarantee hidden joint locations. Review the video overlays, gate numbers and Blender contact sheet before using a clip.

Vendor origins and hashes are in [NOTICE](../third_party/anymove/NOTICE). Carvingen supplies the rtmlib reader and Blender posing, rendering, checks and exports.
