import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from scene import *
p=args(); out=Path(p['output']); out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=p['blend']); info=json.loads(Path(p['info']).read_text())
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE'); sc=bpy.context.scene; sc.render.fps=24; sc.render.fps_base=1
bones={canonical(b.name):b for b in arm.pose.bones}; truth=[]; studio()
for f in range(48):
    phase=math.sin(2*math.pi*f/48)
    for side,sign in [('Left',1),('Right',-1)]:
        aim(bones[side+'Arm'],(sign*.32,sign*.12*phase,-1)); aim(bones[side+'ForeArm'],(sign*.25,sign*.18*phase,-1))
    bones['Spine'].rotation_mode='XYZ'; bones['Spine'].rotation_euler=(0,.025*phase,0)
    bpy.context.view_layer.update()
    truth.append([list(arm.matrix_world @ arm.pose.bones[info['bones'][k['bone']]['name']].head) for k in info['keypoints']])
    render_views(out,f'frame-{f:03d}'); progress(round(100*(f+1)/48),'rendering exam')
(out/'truth.json').write_text(json.dumps({'fps':24,'names':[k['name'] for k in info['keypoints']],'joints':truth}))
result(out,[],frames=48,fps=24)
