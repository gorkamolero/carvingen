"""Shared Blender 5.x import/export helpers. Arguments are passed as JSON, never shell code."""
import bpy, json, sys, os, math
from pathlib import Path

def args():
    return json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())

def progress(percent, message):
    print(f'PROGRESS {percent} {message}', flush=True)

def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def import_model(path):
    before = set(bpy.data.objects)
    ext = Path(path).suffix.lower()
    if ext == '.glb': bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.bvh': bpy.ops.import_anim.bvh(filepath=path)
    else: raise ValueError('Unsupported model format: ' + ext)
    return list(set(bpy.data.objects) - before)

def select(objects, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    if active: bpy.context.view_layer.objects.active = active

def triangles(objects=None):
    return sum(len(p.vertices)-2 for o in (objects or bpy.context.scene.objects) if o.type == 'MESH' for p in o.data.polygons)

def export_pair(directory, name='model'):
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    glb, fbx = directory / (name+'.glb'), directory / (name+'.fbx')
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS')
    bpy.ops.export_scene.fbx(filepath=str(fbx), use_selection=True, add_leaf_bones=False,
        bake_anim=True, bake_anim_use_all_actions=True, path_mode='COPY', embed_textures=True,
        axis_forward='-Z', axis_up='Y')
    return [{'name': name+'-glb', 'kind': 'glb', 'path': str(glb)}, {'name': name+'-fbx', 'kind': 'fbx', 'path': str(fbx)}]

def result(directory, files, **metadata):
    Path(directory).mkdir(parents=True, exist_ok=True)
    Path(directory, 'result.json').write_text(json.dumps({'files': files, **metadata}, indent=2))
    progress(100, 'complete')

def bone_map():
    return json.loads(Path(__file__).with_name('bone-map.json').read_text())

def canonical(name):
    stripped = name.split(':')[-1].replace('mixamorig', '').lstrip('_')
    maps = bone_map()
    for key, row in maps.items():
        if stripped.lower() in [key.lower()] + [str(v).lower() for v in row.values()]: return key
    return stripped
