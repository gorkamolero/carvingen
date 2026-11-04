import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from scene import *
p=args(); out=Path(p['output']); out.mkdir(parents=True,exist_ok=True); reset()
objects=import_model(p['input']); arms=[o for o in objects if o.type=='ARMATURE']
if len(arms)!=1: raise ValueError('Motion requires one humanoid armature')
arm=arms[0]; meshes=skin(arm)
for o in list(bpy.context.scene.objects):
    if o.type=='MESH' and o not in meshes: bpy.data.objects.remove(o,do_unlink=True)
if not meshes: raise ValueError('Rig contains no skinned mesh')
# Bring mesh and armature data into a common native world frame before scaling.
for o in [*meshes,arm]:
    mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=Matrix.Identity(4); o.data.transform(mw)
for o in meshes: o.parent=arm; o.matrix_parent_inverse=Matrix.Identity(4)
arm.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for pb in arm.pose.bones: pb.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update(); a=vertices(meshes); native=float(np.ptp(a[:,2])); s=p['heightMeters']/native
if native<=0: raise ValueError('Rig skin has no height')
select([arm],arm); bpy.ops.object.mode_set(mode='EDIT')
for b in arm.data.edit_bones:
    lengths=[(c.head-b.head).length for c in b.children if (c.head-b.head).length>1e-6]
    b.length=min(lengths) if lengths else native*.02
bpy.ops.object.mode_set(mode='OBJECT')
lookup={canonical(b.name):b for b in arm.data.bones}
if any(b not in lookup for b,_ in KEYS.values()): raise ValueError('Humanoid rig is missing required joint bones')
offset=Vector((-lookup['Hips'].head_local.x,-lookup['Hips'].head_local.y,-float(a[:,2].min())))
for o in [arm,*meshes]: o.data.transform(Matrix.Translation(offset))
arm.scale=(s,s,s); bpy.context.view_layer.update()
order=[]
def visit(b):
    if canonical(b.name) in SUBSET: order.append(b)
    for c in b.children: visit(c)
for b in arm.data.bones:
    if b.parent is None: visit(b)
info={'bones':[],'keypoints':[], 'scale':s, 'nativeHeight':native, 'boneCount':len(arm.data.bones)}
heads={bone:name for name,(bone,_) in KEYS.items()}
tails={'Hips':'spine','Spine':'neck','Spine1':'neck','Spine2':'neck','Neck':'head'}
for side,suffix in [('Left','L'),('Right','R')]:
    for b,k in [('Arm','elbow'),('ForeArm','wrist'),('UpLeg','knee'),('Leg','ankle'),('Foot','toe')]: tails[side+b]=k+'_'+suffix
for b in order:
    key=canonical(b.name); parent=b.parent
    while parent and parent not in order: parent=parent.parent
    m=b.matrix_local.copy(); m.translation*=s
    limit=[[ -60,60] for _ in range(3)]
    if key=='Hips': limit=[[-179,179]]*3
    elif key.endswith(('UpLeg','Arm')) and not key.endswith('ForeArm'): limit=[[-135,135],[-100,100],[-135,135]]
    elif key.endswith(('Leg','ForeArm')): limit=[[-150,150],[-15,15],[-150,150]]
    elif key.endswith('ToeBase'): limit=[[-2,2]]*3
    info['bones'].append({'name':b.name,'parent':order.index(parent) if parent else -1,'matrix_local':[list(r) for r in m],'length':b.length*s,'limits_deg':limit,'head_joint':heads.get(key,'untracked'),'tail_joint':tails.get(key,'untracked')})
for name,(bone,coco) in KEYS.items():
    b=lookup[bone]; info['keypoints'].append({'name':name,'bone':order.index(b),'end':'head','rest':list(b.head_local*s),'coco':coco})
(out/'rig-info.json').write_text(json.dumps(info,indent=2))
clause={'feet':'Both soles stay planted on the ground.','hands':'Both palms stay planted on the ground.','body':'The character stays prone on the ground throughout; the legs and hips do not move.'}[p['planted']]
creature={'name':'character','noun':'character','describe':p.get('subjectDescription','a stylised game character, exactly the rendered proportions and painted textures'),'colour_code':'preserve anatomical left and right; the body keeps its own colours','limbs':'limbs','flank':'side','count':'Exactly one character with two arms and two legs in each view, the same character seen twice. No props, no other people, no water, no particles, no held objects. Only the body moves. Plain fixed ground at the floor band. Preserve the first-frame pose and the fixed front and right-flank projections; no yaw rotation. '+clause,'layout':{'W_FRONT':720,'W_SIDE':720,'M_PER_PX':2.2/720,'GROUND_V':615},'feet':['ankle_L','ankle_R'],'contacts':['ankle_L','ankle_R','toe_L','toe_R']}
(out/'creature.json').write_text(json.dumps(creature,indent=2))
studio(); bpy.ops.wm.save_as_mainfile(filepath=str(out/'rig.blend'))
pose(arm,p['firstPose']); files=render_views(out)
result(out,[{'name':k,'kind':'image','path':v} for k,v in files.items()],nativeHeight=native,scale=s,boneCount=len(arm.data.bones))
