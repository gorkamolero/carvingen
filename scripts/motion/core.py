"""Shared CPU-stage contract. Pixel coordinates are local to each half."""
import json, os, sys
from pathlib import Path
import numpy as np

RATIO = 720 / 768
FLOOR_COLUMNS = [4, 40, 724, 760, 776, 812, 1496, 1532]

def solver_pixels(uv, inverse=False):
    return np.asarray(uv, dtype=float) * (1 / RATIO if inverse else RATIO)

def vendor(creature):
    os.environ['MOCAP_CREATURE'] = str(Path(creature).resolve())
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'third_party/anymove'))

def config():
    p = json.loads(Path(sys.argv[-1]).read_text())
    out = Path(p['output']); out.mkdir(parents=True, exist_ok=True)
    vendor(p['creature'])
    return p, out

def write(path, data):
    Path(path).write_text(json.dumps(data, indent=2, allow_nan=False))

def finish(out, **data):
    write(out / 'result.json', {'files': [], **data})
    print('PROGRESS 100 complete', flush=True)

def solver_data(raw, info):
    result = {}
    for view in ['front', 'side']:
        a = np.asarray([f[view] for f in raw['frames']], float)
        hips = (a[:, 11, :2] + a[:, 12, :2]) / 2
        shoulders = (a[:, 5, :2] + a[:, 6, :2]) / 2
        synthetic = {'pelvis': hips * .9 + shoulders * .1, 'spine': hips * .75 + shoulders * .25,
                     'neck': shoulders * .85 + a[:, 0, :2] * .15, 'head': shoulders * .5 + a[:, 0, :2] * .5}
        conf = a[:, [5, 6, 11, 12], 2].min(axis=1) * .25
        uv, c = [], []
        for k in info['keypoints']:
            index = k.get('coco')
            uv.append(a[:, index, :2] if index is not None else synthetic[k['name']])
            c.append(a[:, index, 2] if index is not None else conf)
        result[view + '_uv'] = solver_pixels(np.stack(uv, axis=1))
        result[view + '_conf'] = np.stack(c, axis=1)
    return result

def studio_features(frame):
    import cv2
    grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(float)
    # Columns hug the frame and divider edges, where the character cannot reach; the gate takes their median.
    floor = [int(np.argmax(np.abs(np.diff(grey[450:741, x])))) + 451 for x in FLOOR_COLUMNS]
    # The search interval is in the 1440-wide layout; report displacement in 1536-wide pixels.
    lo, hi = round(700 / RATIO), round(740 / RATIO)
    divider = lo + int(np.argmin(grey[:300, lo:hi+1].mean(axis=0)))
    return {'floor': floor, 'divider': divider}

def gate_numbers(raw, planted='feet'):
    f = np.asarray([r['front'] for r in raw['frames']]); s = np.asarray([r['side'] for r in raw['frames']])
    if not len(f): raise ValueError('Video contains no frames')
    core = np.concatenate([f[:, 5:17, 2], s[:, 5:17, 2]], axis=1)
    coverage = float(np.mean(np.mean(core > .3, axis=1) >= .8))
    fw = f[:, 5, 0] - f[:, 6, 0]; sw = np.abs(s[:, 5, 0] - s[:, 6, 0])
    facing = float(np.mean((fw > 0) & (sw < np.maximum(.8 * fw, 18))))
    # Both views share the vertical axis, so a foot that really rises and falls does so in both views.
    # An ankle is scored when it moves in both; a still foot, or one that moves in one view only
    # (reader noise, e.g. feet hidden behind a prone body), is unscored. With the whole body planted
    # the legs are replaced by the first-frame pose, so their agreement would judge motion the clip never uses.
    agreement = {}
    for name, j in [('L', 15), ('R', 16)]:
        mask = (f[:, j, 2] > .3) & (s[:, j, 2] > .3)
        a, b = f[mask, j, 1], s[mask, j, 1]
        score = None
        if planted != 'body' and len(a) >= 30 and np.ptp(a) >= 8 and np.ptp(b) >= 8:
            score = float(np.corrcoef(a, b)[0, 1]) if a.std() > 0 and b.std() > 0 else 0.0
        agreement[name] = score
    scored = [v for v in agreement.values() if v is not None]
    agreement['score'] = float(np.mean(scored)) if scored else None
    floor = np.median([r['studio']['floor'] for r in raw['frames']], axis=1); divider = np.asarray([r['studio']['divider'] for r in raw['frames']])
    studio = {'floorMaxDeviationPx': float(np.abs(floor - floor[0]).max()), 'dividerMaxDeviationPx': float(np.abs(divider - divider[0]).max())}
    reasons = []
    if coverage < .8: reasons.append(f'coverage {coverage:.3f} < 0.80')
    if facing < .8: reasons.append(f'facing {facing:.3f} < 0.80')
    if agreement['score'] is not None and agreement['score'] < .8: reasons.append(f"agreement {agreement['score']:.3f} < 0.80")
    if studio['floorMaxDeviationPx'] > 8: reasons.append('floor edge moved more than 8 px')
    if studio['dividerMaxDeviationPx'] > 4: reasons.append('divider moved more than 4 px')
    return {'coverage': coverage, 'facing': facing, 'agreement': agreement, 'studio': studio, 'pass': not reasons, 'reasons': reasons}
