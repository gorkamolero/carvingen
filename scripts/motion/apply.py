import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from scene import *
from mathutils.bvhtree import BVHTree
p=args(); out=Path(p['output']); out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=p['blend']); info=json.loads(Path(p['info']).read_text()); m=json.loads(Path(p['motion']).read_text())
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE'); meshes=skin(arm); s=info['scale']; sc=bpy.context.scene
names=m['bones']; n=round(p['clipSeconds']*24); source=np.arange(n)*m['fps']/24
if source[-1]>len(m['trans'])-1: raise ValueError('Source motion is shorter than requested clip')
def sample(values):
    a=np.asarray(values); flat=a.reshape(len(a),-1)
    return np.stack([np.interp(source,np.arange(len(a)),flat[:,i]) for i in range(flat.shape[1])],axis=1).reshape((n,)+a.shape[1:])
trans=sample(m['trans']); trans[:,:2]-=np.asarray(m['contacts']['ground_velocity'])[None,:]*source[:,None]
t=np.arange(n); trend=np.polyfit(t,trans[:,:2],1)[0]; trans[:,:2]-=t[:,None]*trend
angles=sample(m['euler']); quats=[]
for v in source:
    lo=int(v); hi=min(lo+1,len(m['root_quat'])-1)
    quats.append(Quaternion(m['root_quat'][lo]).slerp(Quaternion(m['root_quat'][hi]),v-lo))
if p['planted']=='body':
    trans[:]=trans[0]; quats=[quats[0]]*n
    for i,name in enumerate(names):
        if canonical(name).endswith(('UpLeg','Leg','Foot','ToeBase')): angles[:,i]=angles[0,i]
root=arm.pose.bones[names[0]]; B=root.bone.matrix_local.to_3x3(); arm.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
sc.render.fps=24; sc.render.fps_base=1; sc.frame_start=0; sc.frame_end=n-1
for f in range(n):
    root.rotation_mode='QUATERNION'; root.rotation_quaternion=quats[f]; root.location=B.transposed() @ Vector(trans[f])/s
    root.keyframe_insert('rotation_quaternion',frame=f); root.keyframe_insert('location',frame=f)
    for i,name in enumerate(names[1:],1):
        b=arm.pose.bones[name]; b.rotation_mode='XYZ'; b.rotation_euler=angles[f,i]; b.keyframe_insert('rotation_euler',frame=f)
arm.animation_data.action.name=p['moveName']
minimum=float('inf'); bounds=[]
for f in range(n):
    sc.frame_set(f); a=vertices(meshes); minimum=min(minimum,float(a[:,2].min())); bounds.extend([a.min(axis=0),a.max(axis=0)])
lift=max(0,-minimum)+1e-7; arm.location.z+=lift
# Classify polygons by summed hand/finger or torso weights at their vertices.
groups=[]
for o in meshes:
    hand={g.index for g in o.vertex_groups if 'Hand' in canonical(g.name)}
    torso={g.index for g in o.vertex_groups if canonical(g.name) in ['Hips','Spine','Spine1','Spine2','Neck']}
    masks=[]
    for ids in [hand,torso]:
        weighted={v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.5}
        masks.append([tuple(poly.vertices) for poly in o.data.polygons if sum(v in weighted for v in poly.vertices)>len(poly.vertices)/2])
    groups.append((o,masks))
positions={canonical(b.name):[] for b in arm.pose.bones}; overlap=0; minz=float('inf')
for f in range(n):
    sc.frame_set(f); bpy.context.view_layer.update(); minz=min(minz,float(vertices(meshes)[:,2].min()))
    for b in arm.pose.bones: positions[canonical(b.name)].append(list(arm.matrix_world @ b.head))
    allverts=[]; polygons=[[],[]]; dg=bpy.context.evaluated_depsgraph_get()
    for o,masks in groups:
        ev=o.evaluated_get(dg); mesh=ev.to_mesh(); offset=len(allverts)
        allverts.extend([ev.matrix_world @ v.co for v in mesh.vertices])
        for j,polys in enumerate(masks): polygons[j].extend([tuple(v+offset for v in poly) for poly in polys])
        ev.to_mesh_clear()
    if all(polygons):
        trees=[BVHTree.FromPolygons(allverts,polys,all_triangles=False) for polys in polygons]
        overlap=max(overlap,len(trees[0].overlap(trees[1])))
    if f%12==0: progress(20+int(40*f/n),'checking skin and contacts')
positions={k:np.asarray(v) for k,v in positions.items()}; drift=0; run_count=0

def measure(name,runs):
    global drift,run_count
    for a,b in runs:
        a=max(0,int(a)); b=min(n,int(b))
        if b-a<2: continue
        run_count+=1; x=positions[name][a:b]; drift=max(drift,float(np.linalg.norm(x-x[0],axis=1).max()*100))
if p['planted']=='feet':
    for j,joint in enumerate(m['contacts']['joints']):
        if joint not in ['ankle_L','ankle_R']: continue
        bone='LeftFoot' if joint.endswith('_L') else 'RightFoot'
        measure(bone,[(math.ceil(a*24/m['fps']),math.ceil(b*24/m['fps'])) for a,b in m['contacts']['runs'][j]])
elif p['planted']=='body':
    for name in positions:
        if name.endswith(('UpLeg','Leg','Foot','ToeBase')): measure(name,[(0,n)])
else:
    for name in ['LeftHand','RightHand']:
        x=positions[name]; mask=(x[:,2]<=x[:,2].min()+.03)&(np.linalg.norm(np.gradient(x,axis=0)*24,axis=1)<.5)
        start=None; runs=[]
        for i,on in enumerate([*mask,False]):
            if on and start is None: start=i
            elif not on and start is not None:
                if i-start>=5: runs.append((start,i))
                start=None
        measure(name,runs)
reasons=[]
if minz < -1e-5: reasons.append('skin below ground')
if overlap!=0: reasons.append(f'hand/torso triangle overlaps: {overlap}')
if not drift<2: reasons.append(f'planted drift {drift:.2f} cm >= 2.0')
checks={'pass':not reasons,'reasons':reasons,'minSkinZ':minz,'handTorsoOverlapMax':overlap,'plantedDriftCm':drift,'plantedRuns':run_count,'groundLiftM':lift,'frames':n,'fps':24,'durationS':n/24}
(out/'checks.json').write_text(json.dumps(checks,indent=2))
studio(); sc.render.resolution_x=640; sc.render.resolution_y=480; sc.render.film_transparent=False
bounds=np.asarray(bounds); target=Vector((bounds.min(axis=0)+bounds.max(axis=0))/2); target.z+=lift
camera('contact-camera',target+Vector((-1,-1,.65)).normalized()*4,target)
bpy.ops.mesh.primitive_plane_add(size=200); floor=bpy.context.object
mat=bpy.data.materials.new('Grey floor'); mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.18,.18,.18,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1
floor.data.materials.append(mat)
tiles=[]
for i,f in enumerate(np.linspace(0,n-1,8).round().astype(int)):
    sc.frame_set(int(f)); path=out/f'sheet-{i}.png'; sc.render.filepath=str(path); bpy.ops.render.render(write_still=True); tiles.append(pixels(path)[:,:,:3])
png(out/'sheet.png',np.concatenate([np.concatenate(tiles[:4],axis=1),np.concatenate(tiles[4:],axis=1)]))
# Constant lift is an object offset; divide it too, to preserve ground clearance in native units.
arm.scale=(1,1,1); arm.location/=s; select([arm,*meshes],arm)
files=export_pair(out,'animations-motion-'+p['slug'])
result(out,files,**checks)
