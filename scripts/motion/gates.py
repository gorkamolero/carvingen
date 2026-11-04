import json
from pathlib import Path
from core import config, finish, write, gate_numbers, solver_data
p, out = config()
from mocap.solve import paw_agreement, sync_report
raw = json.loads(Path(p['joints']).read_text()); info = json.loads(Path(p['info']).read_text())
numbers = gate_numbers(raw, p.get('planted', 'feet')); d = solver_data(raw, info)
numbers['paw_agreement'] = paw_agreement(d, [k['name'] for k in info['keypoints']])
numbers['sync'] = sync_report(d)
write(out / 'gates.json', numbers); finish(out, **numbers)
