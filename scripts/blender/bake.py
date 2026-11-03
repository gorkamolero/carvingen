import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import *
import mathutils

p = args(); reset(); progress(5, 'importing')
objects = import_model(p['input']); meshes = [o for o in objects if o.type == 'MESH']
if not meshes: raise ValueError('Input contains no meshes')
if any(o.type == 'ARMATURE' for o in objects): raise ValueError('Bake must run before Rig; baking a skinned mesh would discard its skin')
select(meshes, meshes[0]); bpy.ops.object.join(); high = bpy.context.object
# Turn around the up axis (Blender Z) so the model faces front (-Y, glTF +Z); riggers assume that.
# A matrix rotation works whatever the object's rotation mode (glTF imports use quaternions).
high.matrix_world = mathutils.Matrix.Rotation(math.radians(p.get('turnDegrees', 0)), 4, 'Z') @ high.matrix_world
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
high.name = 'HighPoly'
low = high.copy(); low.data = high.data.copy(); bpy.context.collection.objects.link(low); low.name = 'LowPoly'
select([low], low)
modifier = low.modifiers.new('TriangleBudget', 'DECIMATE'); modifier.ratio = min(1.0, p.get('targetTriangles', 12000) / max(1, triangles([high])))
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
progress(25, 'unwrapping')
if not p.get('keepUvs') or not low.data.uv_layers:
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
size = int(p.get('textureSize', 2048))
image = bpy.data.images.new('BakedBaseColor', width=size, height=size, alpha=False)
material = bpy.data.materials.new('BakedMaterial'); material.use_nodes = True
node = material.node_tree.nodes.new('ShaderNodeTexImage'); node.image = image
material.node_tree.nodes.active = node
bsdf = material.node_tree.nodes.get('Principled BSDF')
material.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
low.data.materials.clear(); low.data.materials.append(material)
for poly in low.data.polygons: poly.material_index = 0
scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = max(high.dimensions) * 0.025
scene.render.bake.max_ray_distance = max(high.dimensions) * 0.1
scene.render.bake.margin = 16
scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True
select([high, low], low); progress(40, 'baking base colour')
bpy.ops.object.bake(type='DIFFUSE')
out = Path(p['output']); out.mkdir(parents=True, exist_ok=True)
texture = out / 'base-color.png'; image.filepath_raw = str(texture); image.file_format = 'PNG'; image.save(); image.pack()
bpy.data.objects.remove(high, do_unlink=True)
select([low], low); progress(85, 'exporting')
files = export_pair(out)
files.append({'name': 'texture', 'kind': 'texture', 'path': str(texture)})
result(out, files, triangleCount=triangles([low]), boneNames=[])
