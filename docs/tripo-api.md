# Tripo native rigging API

Verified against public docs on 2026-11-03. Base: `https://openapi.tripo3d.ai/v3`.
All requests use `Authorization: Bearer <TRIPO_API_KEY>`; JSON requests also use
`Content-Type: application/json`. The key is server-only and missing keys fail with
`Set TRIPO_API_KEY to use Tripo rigging`.

## Requests and responses used

- [Quick start](https://developers.tripo3d.ai/en/docs/quick-start): asynchronous creation
  returns `{ "code": 0, "data": { "task_id": "..." } }`.
- [Upload](https://developers.tripo3d.ai/en/docs/files): `POST /files`, multipart binary
  `file` named `model.glb`; response `{ "code": 0, "data": { "file_token": "file_..." } }`.
  Models may be up to 150 MB; presigned uploading is suggested above 60 MB, not required.
  A Blender GLB can be passed directly via this token; no generation or import task is needed.
  [Import documentation](https://developers.tripo3d.ai/en/docs/models-import) was also reviewed.
- [Rig-check](https://developers.tripo3d.ai/en/docs/animations-rig-check):
  `POST /animations/rig-check` with `{ "input": "file_..." }`.
  Successful task output is `{ "riggable": true, "rig_type": "biped" }`.
  Both fields must match before the paid rig is submitted.
- [Rig](https://developers.tripo3d.ai/en/docs/animations-rig): `POST /animations/rig`:
  `{ "input": "file_...", "model": "v3.0-20260909", "rig_type": "biped", "spec": "mixamo", "out_format": "glb" }`.
  v3.0 is recommended for humanoids. The docs offer naming conventions but do not
  guarantee finger bones or an exact skeleton. Bone names/count come from the actual GLB skins.
- [Retarget](https://developers.tripo3d.ai/en/docs/animations-retarget):
  `POST /animations/retarget` with `{ "input": "<rig-task-id>", "animation": "preset:walk", "out_format": "glb", "export_with_geometry": true }`.
  One retarget task per distinct selected clip. No deprecated `bake_animation` field.
  v3.0 biped presets are `preset:idle`, `preset:walk`, `preset:run`, `preset:dive`,
  `preset:climb`, `preset:jump`, `preset:slash`, `preset:shoot`, `preset:hurt`,
  `preset:fall`, `preset:turn`. The older v1 90+ preset library is not used.
- [Conversion](https://developers.tripo3d.ai/en/docs/models-convert): `POST /models/convert`
  with `{ "input": "<returned-GLB-URL>", "format": "FBX", "with_animation": true }`.
  This produces FBX from the same rig/clip instead of charging for another rig/retarget.
  URL input is documented; `with_animation` preserves skeleton/animation. Other settings
  retain defaults (basic conversion, embedded textures). Conversion output URLs may lack extensions.
- [Polling](https://developers.tripo3d.ai/en/docs/task-query): `GET /tasks/{task_id}`.
  Response envelope: `{ "code": 0, "data": { "task_id": "...", "status": "success", "progress": 100,
  "output": { "model_url": "https://cdn.tripo3d.ai/output/model.glb" }, "credits_consumed": 25 } }`.
  `error_message` is preserved on failure. `failed`, `cancelled`, `banned`, `expired` are terminal;
  queued/running/unknown states are bounded by 900 polls. Network failures retry six times.
  POSTs are never automatically retried. Created IDs are saved in the job working directory
  before polling, for manual reconciliation after interruption. Restart recovery retains the
  existing character-job failure behavior; it does not silently resubmit paid work.

Only `output.model_url` is persisted, with an explicit GLB/FBX kind; previews are ignored.
The documented `cdn.tripo3d.ai` output host is included in the default asset allowlist.
Downloads use existing size/type validation and SHA deduplication. GLBs are inspected,
combined into an animation pack, and packaged with FBXs in the existing ZIP output.

## Billing and decisions

[Published pricing](https://developers.tripo3d.ai/en/pricing): one credit is $0.01 USD.
Rig-check is free, rigging 25 credits, retargeting 10 credits per animation, basic
conversion 5 credits. Therefore a complete GLB + FBX rig costs 30 credits ($0.30),
and each GLB + FBX clip costs 15 credits ($0.15). These are estimates; failed tasks
and account billing are governed by Tripo. The Run button includes the conversion cost.

Meshy remains the default (legacy Rig nodes with the shared `blender` default still
run Meshy). Tripo rigs always upload the exact connected mesh, avoiding reuse of an
older generation task after a Bake. Result fields `rigEngine` and `tripoRigTaskId`
identify the completed output, independently of subsequent changes to the engine selector.
Animate obtains these through its input edge and preserves separate preset selections
for each engine. Custom clips continue using local Blender retargeting.
Tripo does not expose Meshy's height parameter; import normalization and returned
scale/translation may differ. No promised height adjustment is sent.

No authenticated or paid calls were made during implementation. Actual returned bone
structure, animation quality, normalization, and FBX conversion fidelity require a keyed run.
