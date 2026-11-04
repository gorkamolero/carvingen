import json, os, sys, unittest, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from core import solver_pixels, solver_data, gate_numbers, vendor, studio_features

class MotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Path('tmp').mkdir(exist_ok=True)
        cls.tmp=tempfile.TemporaryDirectory(dir='tmp',prefix='motion-test-')
        Path(cls.tmp.name,'creature.json').write_text(json.dumps({'layout':{'W_FRONT':720,'W_SIDE':720,'M_PER_PX':2.2/720,'GROUND_V':615},'feet':['ankle_L','ankle_R'],'contacts':[]}))
        vendor(cls.tmp.name)
    @classmethod
    def tearDownClass(cls): cls.tmp.cleanup()
    def fixture(self, noise=2):
        from mocap import layout
        rng=np.random.default_rng(40); frames=[]
        for t in range(64):
            a=np.zeros((133,3)); a[:,2]=.99
            for j in range(17):
                a[j,:2]=[440 if j%2 else 320,250+j*15]
            a[15:17,1]=620+25*np.sin(t*2*np.pi/64)
            f=a.copy(); s=a.copy(); s[:,0]=384+(np.arange(133)%2)*5
            f[:,:2]+=rng.uniform(-noise,noise,(133,2)); s[:,:2]+=rng.uniform(-noise,noise,(133,2))
            frames.append({'front':f.tolist(),'side':s.tolist(),'studio':{'floor':[656]*8,'divider':768}})
        return {'fps':24,'frames':frames}
    def test_conversion(self):
        a=np.random.default_rng(1).normal(size=(10,2))*768
        np.testing.assert_allclose(solver_pixels(solver_pixels(a),inverse=True),a)
    def test_gates(self):
        raw=self.fixture(); self.assertTrue(gate_numbers(raw)['pass'])
        for f in raw['frames']:
            for view in ['front','side']:
                for j in range(5,9): f[view][j][2]=.1
        self.assertLess(gate_numbers(raw)['coverage'],.8)
    def test_agreement(self):
        raw=self.fixture()
        for f in raw['frames']:
            for j in [15,16]: f['side'][j][1]=1240-f['front'][j][1]
        self.assertLess(gate_numbers(raw)['agreement']['score'],.8)
    def test_studio(self):
        raw=self.fixture()
        for i,f in enumerate(raw['frames']): f['studio']['divider']+=6*i/(len(raw['frames'])-1)
        self.assertFalse(gate_numbers(raw)['pass'])
        image=np.zeros((768,1536,3),np.uint8); image[:]=(128,130,134); image[656:]=(152,154,158); image[:,766:770]=(34,34,38)
        original=studio_features(image)
        image[:,766:770]=(128,130,134); image[656:,766:770]=(152,154,158); image[:,772:776]=(34,34,38)
        shifted=studio_features(image)
        self.assertEqual(shifted['divider']-original['divider'],6)
        self.assertEqual(original['floor'],[656]*8)
    def test_floor_column_crossed_by_limb(self):
        raw=self.fixture()
        for i,f in enumerate(raw['frames']): f['studio']['floor'][7]=596 if i%2 else 656
        self.assertEqual(gate_numbers(raw)['studio']['floorMaxDeviationPx'],0)
    def test_one_view_motion_unscored(self):
        raw=self.fixture()
        for f in raw['frames']: f['front'][15][1]=f['front'][16][1]=620
        self.assertIsNone(gate_numbers(raw)['agreement']['L'])
    def test_body_planted_legs_unscored(self):
        raw=self.fixture()
        for f in raw['frames']:
            for j in [15,16]: f['side'][j][1]=1240-f['front'][j][1]
        self.assertFalse(gate_numbers(raw)['pass']); self.assertTrue(gate_numbers(raw,'body')['pass'])
        self.assertIsNone(gate_numbers(raw,'body')['agreement']['score'])
    def test_synthetic(self):
        raw=self.fixture(0); info={'keypoints':[{'name':n,'coco':None} for n in ['pelvis','spine','neck','head']]}
        d=solver_data(raw,info); a=np.array(raw['frames'][0]['front']); h=a[[11,12],:2].mean(0); s=a[[5,6],:2].mean(0); nose=a[0,:2]
        np.testing.assert_allclose(d['front_uv'][0],solver_pixels([h*.9+s*.1,h*.75+s*.25,s*.85+nose*.15,s*.5+nose*.5]))
        np.testing.assert_allclose(d['front_conf'],.99*.25)
    def test_fit(self):
        import torch
        from mocap.solve import Rig, fit, axis_angle
        from mocap import layout
        torch.set_num_threads(2)
        # Eight bones with a root and three asymmetric chains, known metric truth.
        positions=[[0,0,.9],[0,0,1.1],[.25,0,1.2],[.5,0,1.2],[-.25,0,1.2],[-.5,0,1.2],[.15,0,.5],[-.15,0,.5]]
        parents=[-1,0,1,2,1,4,0,0]; names=['pelvis','spine','shoulder_L','elbow_L','shoulder_R','elbow_R','ankle_L','ankle_R']
        info={'bones':[],'keypoints':[]}
        for i,(pos,parent) in enumerate(zip(positions,parents)):
            mat=np.eye(4);mat[:3,3]=pos
            info['bones'].append({'name':names[i],'parent':parent,'matrix_local':mat.tolist(),'length':.2,'limits_deg':[[-60,60]]*3,'head_joint':names[i],'tail_joint':names[i+1] if i in [0,2,4] else 'untracked'})
            info['keypoints'].append({'name':names[i],'bone':i,'end':'head','rest':pos})
        T=48; e=torch.zeros((T,8,3),dtype=torch.float64); e[:,2,2]=torch.sin(torch.arange(T)*2*np.pi/T)*.1; e[:,4,2]=-e[:,2,2]
        truth=Rig(info).forward(torch.zeros((T,3),dtype=torch.float64),axis_angle(torch.zeros((T,3),dtype=torch.float64)),e)[0].numpy()
        f,s=layout.project(truth); rng=np.random.default_rng(12)
        d={'front_uv':solver_pixels(solver_pixels(f,inverse=True)+rng.uniform(-2,2,f.shape)),'side_uv':solver_pixels(solver_pixels(s,inverse=True)+rng.uniform(-2,2,s.shape)),'front_conf':np.ones((T,8)),'side_conf':np.ones((T,8))}
        r=fit(d,info,fps=24,log=False)
        self.assertLessEqual(r['reproj_confident_px']['front_x_only'],3)
        self.assertLessEqual(r['reproj_confident_px']['side'],8.5)
        self.assertLess(np.linalg.norm(r['joints']-truth,axis=-1).mean(),.03)
