import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import *

# In-place clips can still sit at a constant offset from the rest pose (e.g. a walk whose hips start 1.4 m
# forward). Remove the horizontal part of that offset from the root bone's keys, keeping its vertical bob,
# so every clip starts where the rest pose stands.
def action_fcurves(action):
    try:
        return list(action.fcurves)
    except AttributeError:  # Blender 5 layered actions
        return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]

p = args(); reset(); progress(10, 'importing')
objects = import_model(p['input'])
arm = next((o for o in objects if o.type == 'ARMATURE'), None)
if not arm or not arm.animation_data or not arm.animation_data.action: raise ValueError('Clip has no animated armature')
hips = next((b for b in arm.pose.bones if b.name.split(':')[-1].lower() in ('hips', 'pelvis')), arm.pose.bones[0])
action = arm.animation_data.action
start, end = [int(v) for v in action.frame_range]
bpy.context.scene.frame_set(start); bpy.context.view_layer.update()
offset = (arm.matrix_world @ hips.head) - (arm.matrix_world @ hips.bone.head_local)
offset.z = 0
local = (arm.matrix_world @ hips.bone.matrix_local).to_3x3().inverted() @ offset
path = f'pose.bones["{hips.name}"].location'
moved = 0
for fc in action_fcurves(action):
    if fc.data_path == path:
        delta = local[fc.array_index]
        for kp in fc.keyframe_points:
            kp.co.y -= delta; kp.handle_left.y -= delta; kp.handle_right.y -= delta
        fc.update(); moved += 1
progress(60, f'recentred by {offset.length:.3f} m')
bpy.context.scene.frame_start = start; bpy.context.scene.frame_end = end
select(objects, arm)
files = export_pair(p['output'], p.get('name', 'clip'))
result(p['output'], files, offsetMetres=round(offset.length, 4), curvesMoved=moved,
    clips=[{'name': p.get('name', 'clip'), 'frameCount': end - start + 1, 'duration': (end - start) / bpy.context.scene.render.fps}])
