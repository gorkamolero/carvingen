"""Blender-only helpers: metres for work, original units for exported keys."""
import sys, json, math, struct, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'blender'))
from common import args, progress, reset, import_model, select, result, canonical, export_pair
import bpy
import numpy as np
from mathutils import Vector, Matrix, Quaternion

KEYS = {'pelvis': ('Hips',None), 'spine': ('Spine',None), 'neck': ('Neck',None), 'head': ('Head',None)}
for side, suffix in [('Left','L'),('Right','R')]:
    for name,bone,index in [('shoulder','Arm',5),('elbow','ForeArm',7),('wrist','Hand',9),('hip','UpLeg',11),('knee','Leg',13),('ankle','Foot',15),('toe','ToeBase',17)]:
        KEYS[name+'_'+suffix] = (side+bone, index + (3 if name=='toe' else 1) * (side=='Right'))
SUBSET = {'Hips','Spine','Spine1','Spine2','Neck','Head'} | {s+b for s in ['Left','Right'] for b in ['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase']}

def skin(arm):
    return [o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==arm for m in o.modifiers)]

def vertices(meshes):
    dg = bpy.context.evaluated_depsgraph_get(); rows=[]
    for o in meshes:
        ev=o.evaluated_get(dg); m=ev.to_mesh()
        a=np.empty(len(m.vertices)*3); m.vertices.foreach_get('co', a)
        rows.append(np.c_[a.reshape(-1,3),np.ones(len(m.vertices))] @ np.array(ev.matrix_world).T)
        ev.to_mesh_clear()
    return np.concatenate(rows)[:,:3]

def png(path, rgb):
    a=np.asarray(rgb,dtype=np.uint8); h,w=a.shape[:2]
    def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6 if a.shape[2]==4 else 2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+r.tobytes() for r in a)))+chunk(b'IEND',b''))

def pixels(path):
    im=bpy.data.images.load(str(path), check_existing=False); im.colorspace_settings.name='Non-Color'
    a=np.empty(len(im.pixels),np.float32); im.pixels.foreach_get(a)
    a=(a.reshape(im.size[1],im.size[0],4)[::-1]*255).clip(0,255).astype(np.uint8); bpy.data.images.remove(im); return a

def studio():
    sc=bpy.context.scene; sc.render.engine='BLENDER_EEVEE'; sc.render.film_transparent=True
    sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'; sc.render.resolution_percentage=100
    sc.view_settings.view_transform='Standard'
    sc.world=sc.world or bpy.data.worlds.new('World'); sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    for name,loc in [('key',(-3,-4,5)),('fill',(3,1,4))]:
        o=bpy.data.objects.get(name)
        if o is None:
            o=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA')); sc.collection.objects.link(o)
        o.location=loc; o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
        o.data.energy=450; o.data.shape='DISK'; o.data.size=5; o.data.use_shadow=False

def camera(name,loc,target,ortho=None):
    sc=bpy.context.scene; o=bpy.data.objects.get(name)
    if o is None: o=bpy.data.objects.new(name,bpy.data.cameras.new(name)); sc.collection.objects.link(o)
    o.location=loc; o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    o.data.type='ORTHO' if ortho else 'PERSP'; o.data.lens=50
    if ortho: o.data.ortho_scale=ortho
    sc.camera=o; return o

def render_views(out, prefix='reference'):
    sc=bpy.context.scene; sc.render.resolution_x=sc.render.resolution_y=768
    z=(656-384)*2.2/768; images=[]; files={}
    for view,loc in [('front',(0,-20,z)),('side',(-20,0,z))]:
        camera('camera-'+view,loc,(0,0,z),2.2)
        path=out/(prefix+'-'+view+'.png'); sc.render.filepath=str(path); bpy.ops.render.render(write_still=True)
        images.append(pixels(path)); files[view]=str(path)
    a=np.zeros((768,1536,3),float); a[:]=(128,130,134); a[656:]=(152,154,158)
    for i,img in enumerate(images):
        alpha=img[:,:,3:4]/255; a[:,i*768:(i+1)*768]=img[:,:,:3]*alpha+a[:,i*768:(i+1)*768]*(1-alpha)
    a[:,766:770]=(34,34,38); path=out/(prefix+'.png'); png(path,a); files['reference']=str(path)
    return files

def aim(pb, direction):
    arm=pb.id_data; bpy.context.view_layer.update()
    base=(pb.parent.matrix @ pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local) if pb.parent else pb.bone.matrix_local
    local=(arm.matrix_world.to_3x3() @ base.to_3x3()).inverted() @ Vector(direction)
    pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=Vector((0,1,0)).rotation_difference(local.normalized()); bpy.context.view_layer.update()

def reach(upper, lower, target, pole):
    arm=upper.id_data; bpy.context.view_layer.update(); head=arm.matrix_world @ upper.head
    goal=Vector(target); d=goal-head; length=d.length; direction=d.normalized()
    a=upper.length*arm.scale.x; b=lower.length*arm.scale.x
    length=min(max(length,abs(a-b)+1e-5),a+b-1e-5)
    x=(a*a-b*b+length*length)/(2*length); y=math.sqrt(max(0,a*a-x*x))
    bend=Vector(pole); bend=(bend-direction*bend.dot(direction)).normalized()
    elbow=head+direction*x+bend*y
    aim(upper,elbow-head); aim(lower,goal-elbow)

def pose(arm, first):
    bones={canonical(b.name):b for b in arm.pose.bones}; root=bones['Hips']; s=arm.scale.x
    if first=='prone':
        # Rotate the standing body onto its front: Z becomes -Y, face -Y becomes -Z.
        B=root.bone.matrix_local.to_3x3(); R=Matrix.Rotation(math.pi/2,3,'X')
        root.rotation_mode='QUATERNION'; root.rotation_quaternion=(B.inverted() @ R @ B).to_quaternion()
        bpy.context.view_layer.update()
        aim(bones['Spine'],(0,-1,.12)); aim(bones['Neck'],(0,-.4,.9)); aim(bones['Head'],(0,-.15,1))
        for side,sign in [('Left',1),('Right',-1)]:
            aim(bones[side+'Arm'],(sign*.4,.85,-.1)); aim(bones[side+'ForeArm'],(sign*.1,-1,-.12)); aim(bones[side+'Hand'],(0,-1,0))
            aim(bones[side+'UpLeg'],(sign*.02,1,0)); aim(bones[side+'Leg'],(0,1,0)); aim(bones[side+'Foot'],(0,1,-.05))
        ground=float(vertices(skin(arm))[:,2].min())
        for side,sign in [('Left',1),('Right',-1)]:
            shoulder=arm.matrix_world @ bones[side+'Arm'].head
            reach(bones[side+'Arm'],bones[side+'ForeArm'],(shoulder.x+sign*.12,shoulder.y+.06,ground+.04),(sign*.25,1,0))
            hand=bones[side+'Hand']; aim(hand,(0,-1,0))
            local_normal=hand.bone.matrix_local.to_3x3().inverted() @ Vector((0,-1,0))
            normal=(arm.matrix_world.to_3x3() @ hand.matrix.to_3x3() @ local_normal).normalized()
            axis=Vector((0,-1,0)); normal=(normal-axis*normal.dot(axis)).normalized(); down=Vector((0,0,-1))
            angle=math.atan2(axis.dot(normal.cross(down)),normal.dot(down))
            hand.rotation_quaternion=hand.rotation_quaternion @ Quaternion((0,1,0),angle)
            for thumb in arm.pose.bones:
                if canonical(thumb.name).startswith(side+'HandThumb') and not thumb.name.endswith('_End'): aim(thumb,(sign*.65,-.75,0))
    else:
        if first in ['low','high']:
            ankles={side:arm.matrix_world @ bones[side+'Foot'].head for side in ['Left','Right']}
            foot_dirs={side:arm.matrix_world.to_3x3() @ (bones[side+'Foot'].tail-bones[side+'Foot'].head) for side in ['Left','Right']}
            hip=(arm.matrix_world @ root.head).z; drop=hip*(.4 if first=='low' else .1)
            root.location=root.bone.matrix_local.to_3x3().transposed() @ Vector((0,0,-drop/s)); bpy.context.view_layer.update()
            width=(bones['LeftArm'].head-bones['RightArm'].head).length*s*(1.3 if first=='low' else 1)
            for side,sign in [('Left',1),('Right',-1)]:
                foot=bones[side+'Foot']; ankle=ankles[side]
                reach(bones[side+'UpLeg'],bones[side+'Leg'],(sign*width/2,ankle.y,ankle.z),(0,-1,0))
                aim(foot,foot_dirs[side])
            aim(bones['Spine'],(0,-.18 if first=='low' else -.04,1))
        for side,sign in [('Left',1),('Right',-1)]:
            aim(bones[side+'Arm'],(sign*.4,-.65,-.55) if first=='low' else (sign*.26,0,-.966))
            aim(bones[side+'ForeArm'],(sign*.1,-1,.15) if first=='low' else (sign*.2,-.04,-1))
    bpy.context.view_layer.update(); a=vertices(skin(arm)); hip=arm.matrix_world @ root.head
    arm.location+=Vector((-hip.x,-hip.y,-float(a[:,2].min()))); bpy.context.view_layer.update()
