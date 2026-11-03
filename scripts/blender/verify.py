"""Reopen smoke outputs; verify actual geometry, texture, bones and animation."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import *
p=args(); root=Path(p['root'])
for ext in ['glb','fbx']:
    reset(); objects=import_model(str(root/'bake'/('model.'+ext)))
    assert triangles(objects) == 2000, (ext, triangles(objects))
    assert any(m.node_tree and any(n.type=='TEX_IMAGE' and n.image for n in m.node_tree.nodes) for m in bpy.data.materials), 'Missing baked image'
    reset(); objects=import_model(str(root/'export'/('character.'+ext)))
    bones={b.name for o in objects if o.type=='ARMATURE' for b in o.data.bones}
    assert {'pelvis','spine_01'}.issubset(bones), bones
    reset(); objects=import_model(str(root/'retarget'/('custom.'+ext)))
    assert any(o.type=='ARMATURE' and o.animation_data and o.animation_data.action for o in objects), 'Missing custom animation'
manifest=json.loads((root/'export'/'manifest.json').read_text())
assert manifest['budgetPass'] and manifest['clips']
progress(100,'reopened GLB and FBX: geometry, materials, renamed bones and animation verified')
