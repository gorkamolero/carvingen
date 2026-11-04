import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from scene import *
p=args(); out=Path(p['output']); out.mkdir(parents=True,exist_ok=True); info=json.loads(Path(p['info']).read_text()); rows=[]; reasons=[]
for path in p['files']:
    reset()
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    sc=bpy.context.scene; sc.render.fps=24; sc.render.fps_base=1
    objects=import_model(path); arms=[o for o in objects if o.type=='ARMATURE']; actions=list(bpy.data.actions)
    row={'file':Path(path).name,'armatures':len(arms),'actions':len(actions),'fps':sc.render.fps}
    if len(arms)!=1 or len(actions)!=1: reasons.append(row['file']+': expected one armature and one action')
    if len(arms)==1 and len(actions)==1:
        arm=arms[0]; names={b.name for b in arm.data.bones}; row['boneCount']=len(names)
        action=actions[0]
        curves=list(action.fcurves) if hasattr(action,'fcurves') else [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
        times=sorted({round(float(k.co.x),5) for fc in curves for k in fc.keyframe_points})
        spacing=min((b-a for a,b in zip(times,times[1:]) if b-a>1e-4),default=0)
        row['minimumKeySpacingFrames']=spacing
        if abs(spacing-1)>1e-3: reasons.append(row['file']+': animation is not sampled at 24 fps')
        start,end=actions[0].frame_range; row['durationS']=(end-start+1)/24
        row['minSkinZ']=min(float((sc.frame_set(f),vertices(skin(arm)))[1][:,2].min()) for f in range(round(start),round(end)+1))
        row['minSkinZM']=row['minSkinZ']*info['scale']
        if len(names)!=info['boneCount']: reasons.append(row['file']+': bone count mismatch')
        if not {b['name'] for b in info['bones']}.issubset(names): reasons.append(row['file']+': solver bones missing')
        if not 3<=row['durationS']<=4: reasons.append(row['file']+': duration outside 3–4 seconds')
        if row['minSkinZM'] < -1e-5: reasons.append(row['file']+': skin below ground')
    if row['fps']!=24: reasons.append(row['file']+': fps is not 24')
    rows.append(row)
result(out,[],**{'pass':not reasons,'reasons':reasons,'exports':rows})
