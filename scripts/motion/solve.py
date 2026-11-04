import json
from pathlib import Path
from core import config, finish, write, solver_data
p, out = config()
import torch
from mocap.solve import fit, to_quat, sync_report
torch.set_num_threads(2)
raw = json.loads(Path(p['joints']).read_text()); info = json.loads(Path(p['info']).read_text())
d = solver_data(raw, info)
print('PROGRESS 10 fitting on CPU', flush=True)
r = fit(d, info, fps=raw['fps'], dev='cpu')
m = {k: r[k] for k in ['bones', 'joint_names', 'contacts', 'reproj_px', 'reproj_confident_px']}
m.update({k: r[k].tolist() for k in ['trans', 'euler', 'joints']})
m.update(fps=raw['fps'], root_quat=to_quat(r['root_rotmat']).tolist(), sync=sync_report(d))
write(out / 'motion.json', m)
e = r['reproj_confident_px']; reasons = []
if not e['front_x_only'] <= 3: reasons.append(f"front-x reprojection {e['front_x_only']:.2f} > 3.0 px")
if not e['side'] <= 8.5: reasons.append(f"side reprojection {e['side']:.2f} > 8.5 px")
numbers = {'pass': not reasons, 'reasons': reasons, 'reproj_confident_px': e}
write(out / 'fit.json', numbers); finish(out, **numbers)
