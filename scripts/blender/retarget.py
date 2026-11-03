"""Name-mapped rest-space rotation retargeting, baked to the target armature."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import *

p = args(); reset(); target_objects = import_model(p['input'])
target = next((o for o in target_objects if o.type == 'ARMATURE'), None)
if target is None: raise ValueError('Target mesh has no armature')
source_objects = import_model(p['clip'])
source = next((o for o in source_objects if o.type == 'ARMATURE'), None)
if source is None or not source.animation_data or not source.animation_data.action: raise ValueError('Clip contains no armature action')
action = source.animation_data.action; start, end = map(int, action.frame_range)
lookup = {canonical(b.name): b for b in source.pose.bones}
matches = [(b, lookup[canonical(b.name)]) for b in target.pose.bones if canonical(b.name) in lookup]
if len(matches) < 2: raise ValueError('Fewer than two matching bones; provide a Mixamo/Humanoid named clip')
target.animation_data_create(); target.animation_data.action = bpy.data.actions.new('CustomClip')
scale = max(target.dimensions) / max(0.001, max(source.dimensions))
for frame in range(start, end+1):
    bpy.context.scene.frame_set(frame)
    for bone, src in matches:
        # Transfer local rotation deltas through the two rest-bone coordinate systems.
        correction = bone.bone.matrix_local.to_quaternion().inverted() @ src.bone.matrix_local.to_quaternion()
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = correction @ src.matrix_basis.to_quaternion() @ correction.inverted()
        bone.keyframe_insert('rotation_quaternion', frame=frame)
        if canonical(bone.name) == 'Hips':
            bone.location = correction @ src.location * scale
            bone.keyframe_insert('location', frame=frame)
    if (frame-start) % 20 == 0: progress(10+int(70*(frame-start)/max(1,end-start)), 'retargeting')
for obj in source_objects: bpy.data.objects.remove(obj, do_unlink=True)
# Only target actions are exported, never the original source rig action.
for old in list(bpy.data.actions):
    if old != target.animation_data.action: bpy.data.actions.remove(old)
bpy.context.scene.frame_start = start; bpy.context.scene.frame_end = end
select(target_objects, target)
files = export_pair(p['output'], 'custom')
result(p['output'], files, triangleCount=triangles(target_objects), boneNames=[b.name for b in target.data.bones],
    clips=[{'name':'CustomClip','frameCount':end-start+1,'duration':(end-start)/bpy.context.scene.render.fps}])
