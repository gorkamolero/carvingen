"""Generate local smoke fixtures; no binary fixtures are committed."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import *
p = args(); reset(); out = Path(p['output']); out.mkdir(parents=True, exist_ok=True)
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64)
mesh = bpy.context.object
mat = bpy.data.materials.new('Color'); mat.use_nodes = True
image = bpy.data.images.new('FixtureChecker',width=64,height=64)
image.pixels = [v for y in range(64) for x in range(64) for v in ((0.8,0.12,0.03,1) if (x//8+y//8)%2 else (0.04,0.25,0.8,1))]
image.pack()
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
mesh.data.materials.append(mat); select([mesh], mesh)
bpy.ops.export_scene.gltf(filepath=str(out/'high.glb'), export_format='GLB', use_selection=True)
bpy.ops.object.armature_add(); arm = bpy.context.object
bpy.ops.object.mode_set(mode='EDIT'); root = arm.data.edit_bones[0]; root.name = 'mixamorig:Hips'
child = arm.data.edit_bones.new('mixamorig:Spine'); child.head=(0,0,1); child.tail=(0,0,2); child.parent=root
bpy.ops.object.mode_set(mode='OBJECT')
mesh.parent = arm; modifier = mesh.modifiers.new('Armature', 'ARMATURE'); modifier.object = arm
group = mesh.vertex_groups.new(name='mixamorig:Hips'); group.add(list(range(len(mesh.data.vertices))),1,'REPLACE')
arm.pose.bones['mixamorig:Hips'].rotation_mode='XYZ'
for frame,angle in [(1,0),(15,0.2),(30,0)]:
    arm.pose.bones['mixamorig:Hips'].rotation_euler.z=angle
    arm.pose.bones['mixamorig:Hips'].keyframe_insert('rotation_euler',frame=frame)
select([mesh,arm],arm)
bpy.ops.export_scene.gltf(filepath=str(out/'rig.glb'),export_format='GLB',use_selection=True,export_animations=True)
progress(100,'fixtures generated')
