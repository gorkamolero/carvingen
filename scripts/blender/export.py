import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import *


def spine_chain_keys(arm):
    hips = next((b for b in arm.data.bones if canonical(b.name) == 'Hips'), None)
    keys, bone = {}, hips
    for key in ['Spine', 'Spine1', 'Spine2']:
        bone = next((c for c in (bone.children if bone else []) if 'spine' in c.name.lower() or 'chest' in c.name.lower()), None)
        if not bone: break
        keys[bone.name] = key
    return keys

def clip_name(action_name):
    # Meshy names actions "Armature|Idle|baselayer"; keep the clip part.
    parts = [x for x in action_name.split('|') if x and x.lower() not in ('armature', 'baselayer')]
    return parts[0] if parts else action_name

def file_stem(name):
    return ''.join(c if c.isalnum() or c in '-_' else '_' for c in name).strip('_')

p = args(); out = Path(p['output']); out.mkdir(parents=True, exist_ok=True)
files = []; clips = []; bone_names = []; count = 0
inputs = p.get('inputs') or [{'path': p['input'], 'name': 'character'}]
for index, entry in enumerate(inputs):
    reset(); progress(10 + int(index / len(inputs) * 70), 'importing '+entry['name'])
    # Each input is exported on its own: drop actions left over from the previous input,
    # or the FBX exporter writes them into this file too.
    for leftover in list(bpy.data.actions): bpy.data.actions.remove(leftover)
    known_actions = set(bpy.data.actions[:])
    objects = import_model(entry['path']); arms = [o for o in objects if o.type == 'ARMATURE']
    new_actions = [a for a in bpy.data.actions if a not in known_actions]
    if not arms and not p.get('convertOnly'): raise ValueError('Engine export requires an armature')
    if not p.get('convertOnly'):
        mapping = bone_map()
        for arm in arms:
            # Spine bones are named by position from the hips: some rigs (Meshy) number them top-down.
            spine_keys = spine_chain_keys(arm)
            targets = {}
            for bone in arm.data.bones:
                key = spine_keys.get(bone.name) or canonical(bone.name)
                if key in mapping: targets[bone] = mapping[key][p.get('target', 'unity')]
            # Two passes so swapping names (Spine02 -> Spine while Spine exists) never yields "Spine.001".
            for i, bone in enumerate(targets): bone.name = f'__rename_{i}'
            for bone, final in targets.items(): bone.name = final
        bone_names = sorted({b.name for a in arms for b in a.data.bones})
    count = max(count, triangles(objects))
    for action in new_actions:
        start, end = action.frame_range
        clips.append({'name': clip_name(action.name), 'frameCount': int(end-start+1), 'duration': (end-start)/bpy.context.scene.render.fps})
    select(objects, arms[0] if arms else objects[0])
    name = entry['name']
    if len(inputs) > 1 and len(new_actions) == 1: name = file_stem(clip_name(new_actions[0].name)) or name
    files += export_pair(out, name)
manifest = {'characterName': p.get('characterName', 'Character'), 'target': p.get('target', 'unity'),
    'triangleCount': count, 'triangleBudget': p.get('triangleBudget', 15000),
    'budgetPass': count <= p.get('triangleBudget', 15000), 'boneNames': bone_names,
    'clips': clips, 'files': [Path(f['path']).name for f in files],
    'notes': 'Bone naming conversion only. Configure Humanoid Avatar in Unity or IK Retargeter in Unreal; this does not synthesize the UE5 mannequin hierarchy.'}
manifest_path = out / 'manifest.json'; manifest_path.write_text(json.dumps(manifest, indent=2))
files.append({'name': 'manifest', 'kind': 'manifest', 'path': str(manifest_path)})
result(out, files, **{k: manifest[k] for k in ['triangleCount', 'budgetPass', 'boneNames', 'clips']})
