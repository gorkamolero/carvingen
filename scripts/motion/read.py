import json
from pathlib import Path
import cv2
import numpy as np
import onnxruntime as ort
from core import config, finish, write, studio_features
p, out = config()
# rtmlib creates its own sessions. Supply bounded options at the session boundary.
Session = ort.InferenceSession
class CpuSession(Session):
    def __init__(self, path_or_bytes, sess_options=None, **kw):
        options = sess_options or ort.SessionOptions()
        options.intra_op_num_threads = 2; options.inter_op_num_threads = 2
        super().__init__(path_or_bytes, sess_options=options, **kw)
ort.InferenceSession = CpuSession
from rtmlib import Wholebody
print('PROGRESS 0 loading CPU whole-body reader and cached weights', flush=True)
model = Wholebody(mode='balanced', backend='onnxruntime', device='cpu', to_openpose=False)
cap = cv2.VideoCapture(p['video']); fps = cap.get(cv2.CAP_PROP_FPS)
if not fps > 0: raise ValueError('Video has no valid fps')
reference = cv2.imread(p['reference'])
if reference is None: raise ValueError('Reference is missing')
frames, images = [], []
calibration = {'fallback': False}; inverse = None
while True:
    ok, frame = cap.read()
    if not ok: break
    frame = cv2.resize(frame, (1536, 768))
    if inverse is None:
        affine = np.eye(2, 3, dtype=np.float32)
        try:
            grey = lambda a: cv2.resize(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), (384, 192))
            _, affine = cv2.findTransformECC(grey(reference), grey(frame), affine, cv2.MOTION_AFFINE,
                (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 150, 1e-6))
            affine[:, 2] *= 4
        except cv2.error:
            affine = np.eye(2, 3, dtype=np.float32); calibration['fallback'] = True
        inverse = cv2.invertAffineTransform(affine)
        calibration.update(affine=affine.tolist(), inverse=inverse.tolist())
    row = {'studio': studio_features(frame)}
    for name, offset in [('front', 0), ('side', 768)]:
        points, scores = model(frame[:, offset:offset+768])
        a = np.zeros((133, 3))
        if len(points):
            best = int(np.argmax(np.asarray(scores)[:, :17].mean(axis=1)))
            a[:, :2] = points[best]; a[:, 2] = scores[best]
            a[:, 0] += offset
            a[:, :2] = np.c_[a[:, :2], np.ones(133)] @ inverse.T
            a[:, 0] -= offset
        row[name] = a.tolist()
    frames.append(row); images.append(frame)
    print(f'PROGRESS {min(95, len(frames))} reading frame {len(frames)}', flush=True)
cap.release()
if len(frames) < 2: raise ValueError('Video has fewer than two frames')
write(out / 'joints.json', {'fps': fps, 'frames': frames, 'calibration': calibration})
bones = [(5,6),(5,7),(7,9),(6,8),(8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]
tiles = []
for i in np.linspace(0, len(frames)-1, 8).round().astype(int):
    tile = images[i].copy()
    for name, offset in [('front',0), ('side',768)]:
        a = np.asarray(frames[i][name]); xy = a[:, :2].copy(); xy[:, 0] += offset
        # Draw calibrated readings back onto the observed frame for an honest overlay.
        xy = (np.c_[xy, np.ones(133)] @ affine.T).round().astype(int)
        for j,k in bones:
            if min(a[j,2],a[k,2]) > .3: cv2.line(tile, tuple(xy[j]), tuple(xy[k]), (0,230,255), 3)
        for j in range(17):
            if a[j,2] > .3: cv2.circle(tile, tuple(xy[j]), 4, (30,40,255), -1)
    cv2.putText(tile, f'{i}  {i/fps:.2f}s', (20,40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
    tiles.append(cv2.resize(tile, (768,384)))
cv2.imwrite(str(out/'video-sheet.png'), np.concatenate([np.concatenate(tiles[:4],axis=1),np.concatenate(tiles[4:],axis=1)]))
finish(out, fps=fps, frames=len(frames), calibration=calibration)
